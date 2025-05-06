import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

const OTP_EXPIRY_SECONDS = 300; // 5 minutes

@Injectable()
export class OtpRedisService {
  private readonly logger = new Logger(OtpRedisService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Store the phone number associated with a transaction ID
   * @param tid Transaction ID
   * @param phoneNumber Phone number
   */
  async storePhoneNumber(tid: string, phoneNumber: string): Promise<void> {
    const key = `otp:${tid}:phone`;
    await this.redis.set(key, phoneNumber, 'EX', OTP_EXPIRY_SECONDS);
    this.logger.log(`Stored phone number ${phoneNumber} for TID: ${tid}`);
  }

  /**
   * Get the phone number associated with a transaction ID
   * @param tid Transaction ID
   * @returns The phone number or null if not found
   */
  async getPhoneNumber(tid: string): Promise<string | null> {
    const key = `otp:${tid}:phone`;
    const phoneNumber = await this.redis.get(key);
    return phoneNumber;
  }

  /**
   * Delete the phone number associated with a transaction ID
   * @param tid Transaction ID
   */
  async deletePhoneNumber(tid: string): Promise<void> {
    const key = `otp:${tid}:phone`;
    await this.redis.del(key);
    this.logger.log(`Deleted phone number for TID: ${tid}`);
  }
} 