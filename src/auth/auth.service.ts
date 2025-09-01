import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../entities/user.entity';
import { OrvioService } from './services/orvio.service';
import { OtpRedisService } from './services/otp-redis.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  private readonly isDebugMode: boolean;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly orvioService: OrvioService,
    private readonly otpRedisService: OtpRedisService,
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.isDebugMode =
      this.configService.get<string>('DEBUG_ENABLED') === 'true';
    console.log(`Debug mode is ${this.isDebugMode ? 'enabled' : 'disabled'}`);
  }

  // Send OTP to user's phone number
  async sendOtp(phoneNumber: string): Promise<{ tid: string }> {
    if (this.isDebugMode) {
      console.log(`[DEBUG] Sending fake OTP to ${phoneNumber}`);
      // Generate a random tid
      const tid = `debug-${uuidv4()}`;

      // Store the phone number in Redis using the transaction ID
      await this.otpRedisService.storePhoneNumber(tid, phoneNumber);

      return { tid };
    }

    // Real implementation using Orvio
    const { tid } = await this.orvioService.sendOtp(phoneNumber);

    // Store the phone number in Redis using the transaction ID
    await this.otpRedisService.storePhoneNumber(tid, phoneNumber);

    return { tid };
  }

  // Verify OTP and create or login user if verification successful
  async verifyOtpAndLoginOrCreateUser(
    tid: string,
    otp: string,
    fcmToken?: string,
  ): Promise<{ user: User; accessToken: string; refreshToken: string } | null> {
    // Get phone number from Redis
    const phoneNumber = await this.otpRedisService.getPhoneNumber(tid);

    if (!phoneNumber) {
      throw new BadRequestException(
        'Session expired or invalid transaction ID',
      );
    }

    if (this.isDebugMode) {
      console.log(`[DEBUG] Bypassing OTP verification for ${phoneNumber}`);
      // In debug mode, skip the actual verification
    } else {
      // Verify OTP with Orvio service
      const verification = await this.orvioService.verifyOtp(tid, otp);

      if (!verification.verified) {
        throw new BadRequestException('Invalid OTP');
      }
    }

    // Create or update user
    let user = await this.userRepository.findOne({
      where: { phoneNumber },
    });

    if (!user) {
      // Create new user
      user = this.userRepository.create({
        phoneNumber,
        fcmToken,
      });

      // Save the new user to generate an ID
      user = await this.userRepository.save(user);
      console.log(`Created new user with ID: ${user.id}`);
    } else if (fcmToken) {
      // Update FCM token if provided
      user.fcmToken = fcmToken;
      user = await this.userRepository.save(user);
    }

    // Clean up Redis
    await this.otpRedisService.deletePhoneNumber(tid);

    // Before creating new tokens, blacklist all existing tokens for this user
    if (user.id) {
      await this.blacklistAllUserTokens(user.id);
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Store refresh token on the user
    user.refreshToken = tokens.refreshToken;
    await this.userRepository.save(user);

    return {
      user,
      ...tokens,
    };
  }

  // Store access token for a user
  private async storeTokenForUser(
    userId: string,
    token: string,
  ): Promise<void> {
    console.log(
      `Storing token for user: ${userId}, token: ${token.substring(0, 20)}...`,
    );

    try {
      // Store token in a set specific to this user
      await this.redis.sadd(`user:${userId}:tokens`, token);

      // Also store with TTL for easy blacklisting later
      const decoded = this.jwtService.decode(token);
      if (decoded && decoded['exp']) {
        const expiry = decoded['exp'];
        const currentTime = Math.floor(Date.now() / 1000);
        const ttl = Math.max(0, expiry - currentTime);
        if (ttl > 0) {
          await this.redis.setex(`token:${token}`, ttl, userId);
          console.log(`Token stored with TTL: ${ttl} seconds`);
        }
      }

      console.log(`Token stored successfully for user ${userId}`);
    } catch (error) {
      console.error(`Error storing token for user ${userId}:`, error);
      throw error;
    }
  }

  // Update FCM token for an existing user
  async updateFcmToken(userId: string, fcmToken: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.fcmToken = fcmToken;
    await this.userRepository.save(user);

    return user;
  }

  // Generate access and refresh tokens
  private async generateTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: user.id, phoneNumber: user.phoneNumber };

    const accessTokenExpiry = `${this.configService.get('JWT_EXPIRES_IN')}s`;
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessTokenExpiry,
    });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });

    // Store access token in Redis
    await this.storeTokenForUser(user.id, accessToken);

    return {
      accessToken,
      refreshToken,
    };
  }

  // Refresh tokens
  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // Verify the refresh token
      const decoded = this.jwtService.verify(refreshToken);
      const userId = decoded.sub;

      // Check if the refresh token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(refreshToken);
      if (isBlacklisted) {
        throw new ForbiddenException(
          'Invalid refresh token, please sign in again',
        );
      }

      // Find the user
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new ForbiddenException('User not found, please sign in again');
      }

      // Check if this is the same refresh token stored on the user
      if (user.refreshToken !== refreshToken) {
        throw new ForbiddenException(
          'Invalid refresh token, please sign in again',
        );
      }

      // Generate only a new access token, keep the same refresh token
      const payload = { sub: user.id, phoneNumber: user.phoneNumber };
      const accessTokenExpiry = `${this.configService.get('JWT_EXPIRES_IN')}s`;
      const accessToken = this.jwtService.sign(payload, {
        expiresIn: accessTokenExpiry,
      });

      // Store the new access token
      await this.storeTokenForUser(userId, accessToken);

      return {
        accessToken,
        refreshToken: user.refreshToken, // Return the existing refresh token
      };
    } catch (error) {
      throw new ForbiddenException(
        'Invalid refresh token, please sign in again',
      );
    }
  }

  // Check if a token is blacklisted
  async isTokenBlacklisted(token: string): Promise<boolean> {
    console.log(
      `Checking if token is blacklisted: ${token.substring(0, 20)}...`,
    );

    try {
      // Check if this token is in the blacklist
      const exists = await this.redis.exists(`blacklist:token:${token}`);
      console.log(
        `Blacklist check result: ${exists ? 'Found in blacklist' : 'Not in blacklist'}`,
      );

      return exists === 1;
    } catch (error) {
      console.error('Error checking token blacklist:', error);
      // If there's an error checking blacklist, we should fail closed (assume it's blacklisted)
      return true;
    }
  }

  // Move all tokens for a user to blacklist
  private async blacklistAllUserTokens(userId: string): Promise<void> {
    console.log(`Blacklisting all tokens for user: ${userId}`);

    try {
      // Get all tokens from the user's set
      const userTokens = await this.redis.smembers(`user:${userId}:tokens`);
      console.log(
        `Found ${userTokens.length} tokens to blacklist for user ${userId}`,
      );

      // Blacklist each token
      for (const token of userTokens) {
        // Get TTL directly from Redis
        const ttl = await this.redis.ttl(`token:${token}`);
        console.log(`Token TTL from Redis: ${ttl} seconds`);

        if (ttl > 0) {
          // Add to blacklist with same TTL
          console.log(`Blacklisting token with TTL: ${ttl} seconds`);
          await this.redis.setex(`blacklist:token:${token}`, ttl, 'revoked');

          // Delete the original token key
          await this.redis.del(`token:${token}`);
        }
      }

      // Clear the user's token set
      if (userTokens.length > 0) {
        await this.redis.del(`user:${userId}:tokens`);
        console.log(`Cleared token set for user ${userId}`);
      }
    } catch (error) {
      console.error(`Error blacklisting tokens for user ${userId}:`, error);
    }
  }

  // Sign out user - blacklist all tokens
  async signOut(userId: string): Promise<{ success: boolean }> {
    console.log(`Signing out user: ${userId}`);

    try {
      // 1. Get the user's tokens from Redis
      const userTokens = await this.redis.smembers(`user:${userId}:tokens`);
      console.log(
        `Found ${userTokens.length} active tokens for user ${userId}`,
      );

      // 2. Blacklist all tokens
      for (const token of userTokens) {
        // Get TTL directly from Redis
        const ttl = await this.redis.ttl(`token:${token}`);
        console.log(`Token TTL from Redis: ${ttl} seconds`);

        if (ttl > 0) {
          // Add to blacklist with same TTL
          console.log(`Blacklisting token with TTL: ${ttl} seconds`);
          await this.redis.setex(`blacklist:token:${token}`, ttl, 'revoked');

          // Delete the original token key
          await this.redis.del(`token:${token}`);
        }
      }

      // 3. Remove all tokens from the user's set
      if (userTokens.length > 0) {
        await this.redis.del(`user:${userId}:tokens`);
        console.log(`Removed all tokens for user ${userId}`);
      }

      // 4. Clear the refresh token in the database
      await this.userRepository.update({ id: userId }, { refreshToken: '' });
      console.log(`Cleared refresh token in database for user ${userId}`);

      return { success: true };
    } catch (error) {
      console.error(`Error signing out user ${userId}:`, error);
      throw error;
    }
  }
}
