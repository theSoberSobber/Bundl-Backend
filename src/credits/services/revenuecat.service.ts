import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { User } from '../../entities/user.entity';
import { CreditPurchase } from '../../entities/credit-purchase.entity';

// RevenueCat webhook event interface (exact match to documentation)
export interface RevenueCatWebhookEvent {
  api_version: string;
  event: {
    type: 'INITIAL_PURCHASE' | 'RENEWAL' | 'CANCELLATION' | 'EXPIRATION' | 'NON_RENEWING_PURCHASE' | string; // Allow unknown types for future-proofing
    id: string; // Unique identifier for idempotency
    event_timestamp_ms: number;
    app_user_id: string;
    original_app_user_id: string;
    aliases: string[];
    product_id: string;
    period_type?: 'NORMAL' | 'INTRO' | 'TRIAL' | 'PROMOTIONAL' | 'PREPAID';
    purchased_at_ms?: number;
    expiration_at_ms?: number;
    environment: 'SANDBOX' | 'PRODUCTION';
    entitlement_ids?: string[];
    presented_offering_id?: string;
    transaction_id: string;
    original_transaction_id: string;
    is_family_share?: boolean;
    country_code?: string;
    app_id: string;
    currency?: string;
    price?: number;
    price_in_purchased_currency?: number;
    subscriber_attributes?: Record<string, any>;
    store: 'PLAY_STORE' | 'APP_STORE' | 'AMAZON' | 'STRIPE' | 'PROMOTIONAL';
    takehome_percentage?: number;
    tax_percentage?: number;
    commission_percentage?: number;
    offer_code?: string;
    cancel_reason?: 'UNSUBSCRIBE' | 'BILLING_ERROR' | 'DEVELOPER_INITIATED' | 'PRICE_INCREASE' | 'CUSTOMER_SUPPORT' | 'UNKNOWN';
    expiration_reason?: 'UNSUBSCRIBE' | 'BILLING_ERROR' | 'DEVELOPER_INITIATED' | 'PRICE_INCREASE' | 'CUSTOMER_SUPPORT' | 'UNKNOWN' | 'SUBSCRIPTION_PAUSED';
  };
}

// Credit package definitions
export interface CreditPackageInfo {
  id: string;
  credits: number;
  price: number;
  name: string;
  description: string;
  productId: string; // Google Play product ID
}

@Injectable()
export class RevenueCatService {
  private readonly logger = new Logger(RevenueCatService.name);
  
  // Product ID to Credits mapping
  private readonly PRODUCT_CREDIT_MAP = {
    'bundle_5_credits': 5,
    'bundle_10_credits': 10,
    'bundle_20_credits': 20,
  } as const;

  private readonly revenueCatWebhookSecret: string;
  private readonly environment: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectEntityManager() private readonly entityManager: EntityManager,
    @InjectRepository(CreditPurchase)
    private readonly creditPurchaseRepository: Repository<CreditPurchase>,
  ) {
    this.revenueCatWebhookSecret = this.configService.get<string>(
      'REVENUECAT_WEBHOOK_SECRET',
      'dev-secret-key'
    );
    this.environment = this.configService.get<string>('NODE_ENV', 'development');
    
    this.logger.log(`RevenueCat service initialized in ${this.environment} mode`);
  }

  /**
   * Get available credit packages
   */
  getCreditPackages(): CreditPackageInfo[] {
    return [
      {
        id: 'basic',
        credits: 5,
        price: 5,
        name: 'Basic Package',
        description: '5 credits for creating or pledging to orders',
        productId: 'bundle_5_credits'
      },
      {
        id: 'standard',
        credits: 10,
        price: 8,
        name: 'Standard Package',
        description: '10 credits for creating or pledging to orders',
        productId: 'bundle_10_credits'
      },
      {
        id: 'premium',
        credits: 20,
        price: 12,
        name: 'Premium Package',
        description: '20 credits for creating or pledging to orders',
        productId: 'bundle_20_credits'
      },
    ];
  }

  /**
   * Calculate price for a given number of credits (backward compatibility)
   */
  calculatePrice(credits: number): number {
    // Use predefined packages first
    const packages = this.getCreditPackages();
    const exactMatch = packages.find(pkg => pkg.credits === credits);
    if (exactMatch) {
      return exactMatch.price;
    }

    // Fallback calculation logic
    if (credits <= 4) {
      return Math.round(credits * 1.2);
    } else if (credits <= 9) {
      return Math.round(credits * 1.0);
    } else if (credits <= 19) {
      return Math.round(credits * 0.8);
    } else {
      return Math.round(credits * 0.6);
    }
  }

  /**
   * Verify RevenueCat webhook authorization header (RevenueCat best practice)
   */
  verifyWebhookAuthorization(authorizationHeader: string): boolean {
    try {
      if (!this.revenueCatWebhookSecret) {
        this.logger.error('RevenueCat webhook secret is not configured');
        return false;
      }

      // RevenueCat recommends using authorization header for webhook authentication
      const expectedAuth = `Bearer ${this.revenueCatWebhookSecret}`;
      const receivedAuth = authorizationHeader || '';
      
      this.logger.debug(`Webhook authorization verification:`);
      this.logger.debug(`Expected: ${expectedAuth}`);
      this.logger.debug(`Received: ${receivedAuth}`);

      return receivedAuth === expectedAuth;
    } catch (error) {
      this.logger.error('Error verifying webhook authorization:', error);
      return false;
    }
  }

  /**
   * Process RevenueCat webhook event with deferred processing pattern
   * RevenueCat Best Practice: Respond quickly (<60s), defer heavy processing
   */
  async processWebhookEvent(event: RevenueCatWebhookEvent): Promise<{ success: boolean; shouldDefer?: boolean }> {
    const { type, id: eventId, app_user_id } = event.event;
    
    this.logger.log(`Processing RevenueCat event: ${type} (${eventId}) for user ${app_user_id}`);
    
    try {
      // RevenueCat Best Practice: Quick acknowledgment with deferred processing for complex operations
      switch (type) {
        case 'INITIAL_PURCHASE':
        case 'RENEWAL':
        case 'PRODUCT_CHANGE':
          // Critical: Award credits immediately (fast operation, <1s)
          // This is safe because we use event ID deduplication
          return { success: await this.awardCreditsForPurchase(event) };
          
        case 'CANCELLATION':
          if (event.event.cancel_reason === 'CUSTOMER_SUPPORT') {
            // Customer support refunds need immediate processing
            return { success: await this.handleRefund(event) };
          }
          // Regular cancellation - acknowledge immediately, defer analytics processing
          this.logger.log(`Subscription cancelled: ${eventId} - ${event.event.cancel_reason}`);
          
          // TODO: Implement deferred processing for analytics/notifications
          // this.deferEventProcessing(event, 'cancellation_analytics');
          return { success: true };
          
        case 'EXPIRATION':
          // Acknowledge immediately, defer cleanup operations
          this.logger.log(`Subscription expired: ${eventId} - ${event.event.expiration_reason}`);
          
          // TODO: Implement deferred processing for cleanup operations
          // this.deferEventProcessing(event, 'expiration_cleanup');
          return { success: true };
          
        default:
          // Future-proofing: handle unknown event types gracefully
          this.logger.log(`Unhandled webhook event type: ${type} (${eventId}) - acknowledging`);
          
          // TODO: Implement deferred processing for unknown events
          // this.deferEventProcessing(event, 'unknown_event_analysis');
          return { success: true };
      }
    } catch (error) {
      this.logger.error(`Error processing webhook event ${eventId}:`, error);
      return { success: false };
    }
  }  /**
   * Award credits for a successful purchase using event ID for idempotency (RevenueCat best practice)
   */
  private async awardCreditsForPurchase(event: RevenueCatWebhookEvent): Promise<boolean> {
    const { 
      app_user_id, 
      product_id, 
      transaction_id, 
      original_transaction_id, 
      price, 
      currency, 
      id: eventId 
    } = event.event;
    
    // Get credits amount from product ID
    const credits = this.PRODUCT_CREDIT_MAP[product_id as keyof typeof this.PRODUCT_CREDIT_MAP];
    if (!credits) {
      this.logger.error(`Unknown product ID: ${product_id}`);
      return false;
    }

    try {
      // RevenueCat best practice: Use event ID for idempotency, not Redis locks
      const result = await this.entityManager.transaction(async (manager) => {
        // Check if this event has already been processed using event ID (RevenueCat best practice)
        const existingEvent = await manager.findOne(CreditPurchase, {
          where: { revenueCatEventId: eventId }
        });
        
        if (existingEvent) {
          this.logger.log(`Event ${eventId} already processed`);
          return true;
        }

        // Also check transaction ID as secondary deduplication
        const existingTransaction = await manager.findOne(CreditPurchase, {
          where: { purchaseToken: transaction_id }
        });
        
        if (existingTransaction) {
          this.logger.log(`Transaction ${transaction_id} already processed`);
          return true;
        }

        // Find user with simple lookup (RevenueCat has already validated the purchase)
        const user = await manager.findOne(User, { where: { id: app_user_id } });
        if (!user) {
          this.logger.error(`User not found: ${app_user_id}`);
          return false;
        }

        // Award credits using simple increment (event ID prevents duplicates)
        user.credits += credits;
        await manager.save(User, user);
        
        // Record the purchase with event ID for deduplication
        const purchase = manager.create(CreditPurchase, {
          revenueCatEventId: eventId, // Store event ID for idempotency
          userId: app_user_id,
          purchaseToken: transaction_id,
          productId: product_id,
          creditsAwarded: credits,
          amountPaid: price || this.calculatePrice(credits),
          currency: currency || 'INR',
          originalTransactionId: original_transaction_id,
          revenueCatCustomerId: app_user_id,
          metadata: {
            environment: event.event.environment,
            store: event.event.store,
            country_code: event.event.country_code,
            event_timestamp_ms: event.event.event_timestamp_ms,
          }
        });

        await manager.save(CreditPurchase, purchase);
        
        this.logger.log(`Successfully awarded ${credits} credits to user ${app_user_id} for event ${eventId}`);
        return true;
      });

      return result;
    } catch (error) {
      this.logger.error(`Error awarding credits for event ${eventId}:`, error);
      return false;
    }
  }

  /**
   * Handle refund using event ID for idempotency (RevenueCat best practice)
   */
  private async handleRefund(event: RevenueCatWebhookEvent): Promise<boolean> {
    const { app_user_id, transaction_id, id: eventId } = event.event;
    
    try {
      const result = await this.entityManager.transaction(async (manager) => {
        // Check if this refund event has already been processed
        const existingRefundEvent = await manager.findOne(CreditPurchase, {
          where: { revenueCatEventId: eventId }
        });
        
        if (existingRefundEvent) {
          this.logger.log(`Refund event ${eventId} already processed`);
          return true;
        }

        // Find the original purchase by transaction ID
        const purchase = await manager.findOne(CreditPurchase, {
          where: { purchaseToken: transaction_id }
        });
        
        if (!purchase) {
          this.logger.error(`Original purchase not found for refund: ${transaction_id}`);
          // Still record the refund event to prevent reprocessing
          const refundRecord = manager.create(CreditPurchase, {
            revenueCatEventId: eventId,
            userId: app_user_id,
            purchaseToken: transaction_id,
            productId: 'unknown',
            creditsAwarded: 0,
            amountPaid: 0,
            currency: 'INR',
            metadata: {
              refund: true,
              refundedAt: new Date().toISOString(),
              originalPurchaseNotFound: true,
              environment: event.event.environment,
              event_timestamp_ms: event.event.event_timestamp_ms,
            }
          });
          await manager.save(CreditPurchase, refundRecord);
          return false;
        }

        // Find user
        const user = await manager.findOne(User, { where: { id: app_user_id } });
        if (!user) {
          this.logger.error(`User not found for refund: ${app_user_id}`);
          return false;
        }

        // Deduct credits if user has enough (simple approach - no locks needed with event ID)
        if (user.credits >= purchase.creditsAwarded) {
          user.credits -= purchase.creditsAwarded;
          await manager.save(User, user);
          
          this.logger.log(`Deducted ${purchase.creditsAwarded} credits from user ${app_user_id} for refund ${eventId}`);
        } else {
          this.logger.warn(`User ${app_user_id} doesn't have enough credits (${user.credits}) to deduct for refund (${purchase.creditsAwarded})`);
        }

        // Record the refund event (prevents reprocessing)
        const refundRecord = manager.create(CreditPurchase, {
          revenueCatEventId: eventId,
          userId: app_user_id,
          purchaseToken: transaction_id,
          productId: purchase.productId,
          creditsAwarded: -purchase.creditsAwarded, // Negative for refund
          amountPaid: -(purchase.amountPaid || 0),
          currency: purchase.currency,
          metadata: {
            refund: true,
            refundedAt: new Date().toISOString(),
            originalPurchaseId: purchase.id,
            userCreditsAtRefund: user.credits,
            environment: event.event.environment,
            event_timestamp_ms: event.event.event_timestamp_ms,
          }
        });
        
        await manager.save(CreditPurchase, refundRecord);
        return true;
      });

      return result;
    } catch (error) {
      this.logger.error(`Error processing refund ${eventId}:`, error);
      return false;
    }
  }

  /**
   * Get purchase history for a user
   */
  async getUserPurchaseHistory(userId: string, limit = 10): Promise<CreditPurchase[]> {
    return await this.creditPurchaseRepository.find({
      where: { userId },
      order: { processedAt: 'DESC' },
      take: limit
    });
  }

  /**
   * Defer heavy processing operations for better webhook response times
   * RevenueCat Best Practice: Acknowledge webhook quickly, process complex operations later
   * 
   * WHEN TO IMPLEMENT FULL DEFERRED PROCESSING:
   * 1. If webhook processing time approaches 30s+ (RevenueCat timeout is 60s)
   * 2. When adding complex business logic (email campaigns, analytics, etc.)
   * 3. If you need to call external APIs that might be slow/unreliable
   * 4. For non-critical operations that don't affect user credits immediately
   * 
   * CURRENT STATUS: Our implementation is fast (<5s), so deferred processing is optional
   * 
   * TODO: Implement with message queue (Redis Bull, AWS SQS, etc.) when needed
   */
  private async deferEventProcessing(event: RevenueCatWebhookEvent, processingType: string): Promise<void> {
    this.logger.log(`Deferring processing for event ${event.event.id}: ${processingType}`);
    
    // TODO: Implement message queue integration for production
    // Examples of what could be deferred:
    // - Analytics data aggregation
    // - Email/push notifications to users
    // - Third-party service syncing (CRM, analytics platforms)
    // - Complex business logic calculations
    // - Cleanup operations
    // - Audit trail generation
    
    // For now, just log the deferred operation
    // In production, you would:
    // 1. Add to Redis queue: await this.queueService.add(processingType, event, { delay: 1000 });
    // 2. Or publish to message bus: await this.eventBus.publish(new DeferredEventProcessing(event, processingType));
    // 3. Or store in database for batch processing: await this.deferredEventsRepository.save(...)
    
    this.logger.debug(`Deferred processing queued: ${processingType} for event ${event.event.id}`);
  }

  /**
   * Health check method
   */
  isConfigured(): boolean {
    return Boolean(this.revenueCatWebhookSecret);
  }
}
