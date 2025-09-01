import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OrvioClient from '@orvio/sdk';

@Injectable()
export class OrvioService {
  private readonly logger = new Logger(OrvioService.name);
  private client: OrvioClient;

  constructor(private readonly configService: ConfigService) {
    this.initializeClient();
  }

  private initializeClient() {
    const apiKey = this.configService.get<string>('ORVIO_API_KEY');
    if (!apiKey) {
      this.logger.warn('ORVIO_API_KEY is not defined in environment variables');
      return;
    }

    this.client = new OrvioClient(apiKey);
    this.logger.log('Orvio client initialized successfully');
  }

  /**
   * Send OTP to the user's phone number
   * @param phoneNumber - The phone number to send OTP to
   * @returns Transaction ID for verification
   */
  async sendOtp(phoneNumber: string): Promise<{ tid: string }> {
    if (!this.client) {
      throw new Error('Orvio client not initialized');
    }

    try {
      const orgName = this.configService.get<string>('ORVIO_ORG_NAME');

      const result = await this.client.create(phoneNumber, {
        orgName,
      });

      this.logger.log(
        `OTP sent to ${phoneNumber} with transaction ID: ${result.tid}`,
      );
      return { tid: result.tid };
    } catch (error) {
      this.logger.error(`Failed to send OTP: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify OTP entered by the user
   * @param tid - Transaction ID from sendOtp
   * @param otp - The OTP entered by the user
   * @returns Verification result
   */
  async verifyOtp(tid: string, otp: string): Promise<{ verified: boolean }> {
    if (!this.client) {
      throw new Error('Orvio client not initialized');
    }

    try {
      const result = await this.client.verify(tid, otp);
      this.logger.log(
        `OTP verification result for transaction ${tid}: ${JSON.stringify(result)}`,
      );

      return { verified: result.success === true };
    } catch (error) {
      this.logger.error(`Failed to verify OTP: ${error.message}`, error.stack);
      throw error;
    }
  }
}
