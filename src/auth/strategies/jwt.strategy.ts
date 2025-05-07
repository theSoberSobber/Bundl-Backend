import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // JWT library handles expiration
      secretOrKey: configService.get('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: any) {
    console.log(`JWT Strategy validating token for user ${payload.sub}`);
    
    // Extract token from the request
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      console.log('No token found in request');
      throw new UnauthorizedException('Authentication required');
    }
    
    console.log(`Checking if token is blacklisted: ${token.substring(0, 20)}...`);
    
    // Always check if the token is blacklisted
    const isBlacklisted = await this.authService.isTokenBlacklisted(token);
    console.log(`Is token blacklisted: ${isBlacklisted}`);
    
    if (isBlacklisted) {
      console.log('Token is blacklisted, rejecting request');
      throw new UnauthorizedException('Authentication required');
    }
    
    console.log('Token is valid, proceeding with request');
    
    // Return the payload data
    return { 
      id: payload.sub,
      phoneNumber: payload.phoneNumber
    };
  }
} 