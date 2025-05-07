import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { EntityManager } from 'typeorm';
import { InjectEntityManager } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';

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
    1: 10,    // 1 credit for ₹10
    5: 45,    // 5 credits for ₹45
    10: 80,   // 10 credits for ₹80
    20: 150,  // 20 credits for ₹150
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
    this.clientSecret = this.configService.get<string>('CASHFREE_CLIENT_SECRET');
    this.environment = this.configService.get<string>('CASHFREE_ENVIRONMENT') === 'production' 
      ? 'PRODUCTION' 
      : 'SANDBOX';
    
    this.baseUrl = this.environment === 'PRODUCTION'
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
        price: 5,
        name: 'Basic Package',
        description: '5 credits for creating or pledging to orders'
      },
      {
        id: 'standard',
        credits: 10,
        price: 8,
        name: 'Standard Package',
        description: '10 credits for creating or pledging to orders'
      },
      {
        id: 'premium',
        credits: 20,
        price: 12,
        name: 'Premium Package',
        description: '20 credits for creating or pledging to orders'
      }
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
    
    // Otherwise calculate price: base price is ₹10 per credit, with 10% discount for quantity
    if(credits <=5) {
      return credits;
    } else if(credits <=10) {
      return Math.round(credits * 0.8);
    } else {
      return Math.round(credits * 0.6);
    }
  }

  /**
   * Create a payment order with Cashfree
   */
  async createOrder(userId: string, credits: number, phoneNumber: string): Promise<any> {
    try {
      const amount = this.calculatePrice(credits);
      const orderId = `ORDER_${Date.now()}_${userId.substring(0, 8)}`;
      const baseUrl = this.configService.get<string>('APP_URL', 'https://api.bundl.app');
      
      const request = {
        order_id: orderId,
        order_amount: amount.toString(),
        order_currency: 'INR',
        order_note: `Purchase of ${credits} credits`,
        customer_details: {
          customer_id: userId,
          customer_name: `User_${userId.substring(0, 8)}`,
          customer_email: 'user@example.com', // Required by Cashfree
          customer_phone: phoneNumber.replace('+', '')
        },
        order_meta: {
          notify_url: `${baseUrl}/credits/webhook`
        }
      };

      // Store order details in Redis for verification later
      await this.redis.set(
        `credit_order:${orderId}`, 
        JSON.stringify({
          userId,
          credits,
          amount,
          status: 'PENDING',
          createdAt: new Date().toISOString()
        }),
        'EX', 
        3600 // 1 hour expiry
      );

      // Create order with Cashfree
      const response = await axios.post(
        `${this.baseUrl}/orders`,
        request,
        {
          headers: {
            'x-client-id': this.clientId,
            'x-client-secret': this.clientSecret,
            'x-api-version': this.apiVersion,
            'Content-Type': 'application/json'
          }
        }
      );
      
      this.logger.log(`Created Cashfree order: ${orderId} for user ${userId} - ${credits} credits for ₹${amount}`);
      
      return {
        orderId,
        sessionId: response.data.payment_session_id,
        orderStatus: response.data.order_status,
        amount,
        credits
      };

    } catch (error) {
      this.logger.error(`Error creating Cashfree order: ${error.message}`, error.stack);
      if (error.response?.data) {
        this.logger.error(`Cashfree error details: ${JSON.stringify(error.response.data)}`);
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
      this.logger.error(`Error getting order details: ${error.message}`, error.stack);
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
          verifiedAt: new Date().toISOString()
        }),
        'EX',
        86400 // Keep for 24 hours
      );
      
      this.logger.log(`Updated order ${orderId} status to ${status}`);
      return true;
    } catch (error) {
      this.logger.error(`Error updating order status: ${error.message}`, error.stack);
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
      const response = await axios.get(
        `${this.baseUrl}/orders/${orderId}`,
        {
          headers: {
            'x-client-id': this.clientId,
            'x-client-secret': this.clientSecret,
            'x-api-version': this.apiVersion
          }
        }
      );
      
      const { order_status } = response.data;
      
      this.logger.log(`Verifying order ${orderId} - Status: ${order_status}`);
      
      if (order_status === 'PAID') {
        
        return {
          success: true,
          orderStatus: order_status
        };
      }
      
      return {
        success: order_status === 'PAID',
        orderStatus: order_status,
        userId: response.data.customer_details.customer_id,
        amount: response.data.order_amount
      };
      
    } catch (error) {
      this.logger.error(`Error verifying Cashfree order: ${error.message}`, error.stack);
      if (error.response?.data) {
        this.logger.error(`Cashfree error details: ${JSON.stringify(error.response.data)}`);
      }
      return { 
        success: false,
        orderStatus: "FAILED"
      };
    }
  }
  
  /**
   * Verify Cashfree webhook signature
   */
  verifyWebhookSignature(
    payload: any,
    signature: string,
    timestamp: string
  ): boolean {
    try {
      const data = JSON.stringify(payload);
      const signatureData = data + this.clientSecret + timestamp;
      const computedSignature = crypto
        .createHmac('sha256', this.clientSecret as string)
        .update(signatureData)
        .digest('base64');
      
      return computedSignature === signature;
    } catch (error) {
      this.logger.error(`Error verifying webhook signature: ${error.message}`, error.stack);
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
      const acquired = await this.redis.set(
        lockKey,
        lockValue,
        'EX',
        10,
        'NX'
      );
      
      if (!acquired) {
        this.logger.log(`Lock acquisition failed for order ${orderId}, another process is handling it`);
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
            credits: () => `credits + ${orderDetails.credits}`
          })
          .where('id = :userId', { userId: orderDetails.userId })
          .execute();

        // Delete the order from Redis since it's completed
        await this.redis.del(`credit_order:${orderId}`);
      });

      this.logger.log(`Successfully processed payment for order ${orderId}`);
      return true;

    } catch (error) {
      this.logger.error(`Error processing payment atomically: ${error.message}`, error.stack);
      return false;
      
    } finally {
      // Release the lock only if we still own it
      const currentValue = await this.redis.get(lockKey);
      if (currentValue === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }
} 