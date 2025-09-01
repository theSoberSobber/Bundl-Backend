import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { EntityManager } from 'typeorm';
import { InjectEntityManager } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { createHmac } from 'crypto';

// Define order details interface
export interface OrderDetails {
  userId: string;
  credits: number;
  amount: number;
  status: string;
  createdAt: string;
  verifiedAt?: string;
}

@Injectable()
export class CashfreeService {
  private readonly logger = new Logger(CashfreeService.name);
  private readonly apiVersion = '2023-08-01';
  private readonly creditPrices = {
    5: 5,     // 5 credits for ₹5
    10: 8,    // 10 credits for ₹8
    20: 12,   // 20 credits for ₹12
  };

  private readonly baseUrl: string;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly environment: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
    @InjectEntityManager() private readonly entityManager: EntityManager,
  ) {
    // Initialize Cashfree
    this.clientId = this.configService.get<string>('CASHFREE_CLIENT_ID');
    this.clientSecret = this.configService.get<string>(
      'CASHFREE_CLIENT_SECRET',
    );
    this.environment =
      this.configService.get<string>('CASHFREE_ENVIRONMENT') === 'production'
        ? 'PRODUCTION'
        : 'SANDBOX';

    this.baseUrl =
      this.environment === 'PRODUCTION'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';

    this.logger.log(`Cashfree initialized in ${this.environment} mode`);
  }

  /**
   * Get available credit packages
   */
  getCreditPackages() {
    return [
      {
        id: 'basic',
        credits: 5,
        price: 5,  // ₹1 per credit for 5 credits
        name: 'Basic Package',
        description: '5 credits for creating or pledging to orders'
      },
      {
        id: 'standard',
        credits: 10,
        price: 8,  // ₹0.8 per credit for 10 credits
        name: 'Standard Package',
        description: '10 credits for creating or pledging to orders'
      },
      {
        id: 'premium',
        credits: 20,
        price: 12,  // ₹0.6 per credit for 20 credits
        name: 'Premium Package',
        description: '20 credits for creating or pledging to orders'
      },
    ];
  }

  /**
   * Calculate price for a given number of credits
   */
  calculatePrice(credits: number): number {
    // Use predefined price if available
    if (this.creditPrices[credits]) {
      return this.creditPrices[credits];
    }
    
    // Calculate price based on new ranges
    if (credits <= 4) {
      return Math.round(credits * 1.2);  // ₹1.2 per credit for 1-4 credits
    } else if (credits <= 9) {
      return Math.round(credits * 1.0);  // ₹1.0 per credit for 5-9 credits
    } else if (credits <= 19) {
      return Math.round(credits * 0.8);  // ₹0.8 per credit for 10-19 credits
    } else {
      return Math.round(credits * 0.6);  // ₹0.6 per credit for 20+ credits
    }
  }

  /**
   * Create a payment order with Cashfree
   */
  async createOrder(
    userId: string,
    credits: number,
    phoneNumber: string,
  ): Promise<any> {
    try {
      const amount = this.calculatePrice(credits);
      const orderId = `ORDER_${Date.now()}_${userId.substring(0, 8)}`;
      const baseUrl = this.configService.get<string>(
        'APP_URL',
        'https://api.bundl.app',
      );

      const request = {
        order_id: orderId,
        order_amount: amount.toString(),
        order_currency: 'INR',
        order_note: `Purchase of ${credits} credits`,
        customer_details: {
          customer_id: userId,
          customer_name: `User_${userId.substring(0, 8)}`,
          customer_email: 'user@example.com', // Required by Cashfree
          customer_phone: phoneNumber.replace('+', ''),
        },
        order_meta: {
          notify_url: `${baseUrl}/credits/webhook`,
        },
      };

      // Store order details in Redis for verification later
      await this.redis.set(
        `credit_order:${orderId}`,
        JSON.stringify({
          userId,
          credits,
          amount,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        }),
        'EX',
        3600, // 1 hour expiry
      );

      // Create order with Cashfree
      const response = await axios.post(`${this.baseUrl}/orders`, request, {
        headers: {
          'x-client-id': this.clientId,
          'x-client-secret': this.clientSecret,
          'x-api-version': this.apiVersion,
          'Content-Type': 'application/json',
        },
      });

      this.logger.log(
        `Created Cashfree order: ${orderId} for user ${userId} - ${credits} credits for ₹${amount}`,
      );

      return {
        orderId,
        sessionId: response.data.payment_session_id,
        orderStatus: response.data.order_status,
        amount,
        credits,
      };
    } catch (error) {
      this.logger.error(
        `Error creating Cashfree order: ${error.message}`,
        error.stack,
      );
      if (error.response?.data) {
        this.logger.error(
          `Cashfree error details: ${JSON.stringify(error.response.data)}`,
        );
      }
      throw error;
    }
  }

  /**
   * Get order details from Redis
   */
  async getOrderDetails(orderId: string): Promise<OrderDetails | null> {
    try {
      const orderDetailsStr = await this.redis.get(`credit_order:${orderId}`);

      if (!orderDetailsStr) {
        this.logger.error(`Order details not found for order ID: ${orderId}`);
        return null;
      }

      return JSON.parse(orderDetailsStr) as OrderDetails;
    } catch (error) {
      this.logger.error(
        `Error getting order details: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Update order status in Redis
   */
  async updateOrderStatus(orderId: string, status: string): Promise<boolean> {
    try {
      const orderDetails = await this.getOrderDetails(orderId);

      if (!orderDetails) {
        return false;
      }

      // Update order status in Redis
      await this.redis.set(
        `credit_order:${orderId}`,
        JSON.stringify({
          ...orderDetails,
          status,
          verifiedAt: new Date().toISOString(),
        }),
        'EX',
        86400, // Keep for 24 hours
      );

      this.logger.log(`Updated order ${orderId} status to ${status}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Error updating order status: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Verify payment order status with Cashfree
   */
  async verifyOrder(orderId: string): Promise<{
    success: boolean;
    userId?: string;
    credits?: number;
    amount?: number;
    orderStatus?: string;
  }> {
    try {
      // Fetch order from Cashfree
      const response = await axios.get(`${this.baseUrl}/orders/${orderId}`, {
        headers: {
          'x-client-id': this.clientId,
          'x-client-secret': this.clientSecret,
          'x-api-version': this.apiVersion,
        },
      });
      
      console.log(response.data);

      const { order_status } = response.data;

      this.logger.log(`Verifying order ${orderId} - Status: ${order_status}`);

      return {
        success: order_status === 'PAID',
        orderStatus: order_status,
        userId: response.data.customer_details.customer_id,
        amount: response.data.order_amount,
      };
    } catch (error) {
      this.logger.error(
        `Error verifying Cashfree order: ${error.message}`,
        error.stack,
      );
      if (error.response?.data) {
        this.logger.error(
          `Cashfree error details: ${JSON.stringify(error.response.data)}`,
        );
      }
      return {
        success: false,
        orderStatus: 'FAILED',
      };
    }
  }

  /**
   * Verify Cashfree webhook signature
   */
  async verifyWebhookSignature(
    payload: any,
    timestamp: string,
    signature: string,
  ): Promise<boolean> {
    try {
      if (!this.clientSecret) {
        this.logger.error('Client secret is not configured');
        return false;
      }

      // Get the raw payload string without any modifications
      // This preserves the exact format of numbers like 170.00 vs 170
      const payloadString = JSON.stringify(payload, null, 0);
      
      // Combine payload + timestamp + client secret in the correct order
      const dataToSign = payloadString + timestamp + this.clientSecret;
      
      // Create HMAC SHA256 hash
      const hmac = crypto.createHmac('sha256', this.clientSecret);
      hmac.update(dataToSign);
      const computedSignature = hmac.digest('base64');

      // Log for debugging
      this.logger.debug(`Verifying webhook signature with timestamp: ${timestamp}`);
      this.logger.debug(`Expected: ${signature}`);
      this.logger.debug(`Computed: ${computedSignature}`);
      this.logger.debug(`Payload string: ${payloadString}`);
      this.logger.debug(`Data to sign: ${dataToSign}`);

      return computedSignature === signature;
    } catch (error) {
      this.logger.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Atomically process payment and add credits
   * Returns true if credits were added, false if already processed
   */
  async processPaymentAtomically(orderId: string): Promise<boolean> {
    const lockKey = `lock:credit_order:${orderId}`;
    const lockValue = Date.now().toString();

    try {
      // Try to acquire lock with 10 second expiry
      const acquired = await this.redis.set(lockKey, lockValue, 'EX', 10, 'NX');

      if (!acquired) {
        this.logger.log(
          `Lock acquisition failed for order ${orderId}, another process is handling it`,
        );
        return false;
      }

      // Get order details
      const orderDetails = await this.getOrderDetails(orderId);

      if (!orderDetails || orderDetails.status === 'COMPLETED') {
        return false;
      }

      // Use a transaction to update user credits and clean up Redis
      await this.entityManager.transaction(async (manager) => {
        // Update user credits
        await manager
          .createQueryBuilder()
          .update(User)
          .set({
            credits: () => `credits + ${orderDetails.credits}`,
          })
          .where('id = :userId', { userId: orderDetails.userId })
          .execute();

        // Delete the order from Redis since it's completed
        await this.redis.del(`credit_order:${orderId}`);
      });

      this.logger.log(`Successfully processed payment for order ${orderId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Error processing payment atomically: ${error.message}`,
        error.stack,
      );
      return false;
    } finally {
      // Release the lock only if we still own it
      const currentValue = await this.redis.get(lockKey);
      if (currentValue === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  /**
   * Handle webhook notification from Cashfree
   */
  async handleWebhook(payload: any, signature: string, timestamp: string): Promise<boolean> {
    try {
      // Verify webhook signature
      const isValid = await this.verifyWebhookSignature(payload, timestamp, signature);
      if (!isValid) {
        this.logger.warn('Invalid webhook signature received');
        return false;
      }

      // Get order details from Redis
      const orderId = payload.data.order.order_id;
      const orderDetails = await this.getOrderDetails(orderId);
      
      if (!orderDetails) {
        this.logger.error(`Order details not found for order ID: ${orderId}`);
        return false;
      }

      // Verify payment amount matches what we expected
      const paidAmount = parseFloat(payload.data.payment.payment_amount);
      if (paidAmount !== orderDetails.amount) {
        this.logger.error(`Payment amount mismatch. Expected: ${orderDetails.amount}, Received: ${paidAmount}`);
        return false;
      }

      // Process payment based on webhook type
      switch (payload.type) {
        case 'PAYMENT_SUCCESS_WEBHOOK':
          this.logger.log(`Processing successful payment for order ${orderId}`);
          return await this.processPaymentAtomically(orderId);
          
        case 'PAYMENT_FAILED_WEBHOOK':
          this.logger.log(`Payment failed for order ${orderId}`);
          return true;
          
        case 'PAYMENT_USER_DROPPED_WEBHOOK':
          this.logger.log(`User dropped payment for order ${orderId}`);
          return true;
          
        default:
          this.logger.warn(`Unknown webhook type: ${payload.type}`);
          return false;
      }
    } catch (error) {
      this.logger.error(`Error processing webhook: ${error.message}`, error.stack);
      return false;
    }
  }
}
