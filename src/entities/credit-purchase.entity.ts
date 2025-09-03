import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('credit_purchases')
@Index('idx_purchase_token', ['purchaseToken'], { unique: true })
@Index('idx_event_id', ['revenueCatEventId'], { unique: true }) // For event ID deduplication
@Index('idx_user_purchases', ['userId'])
@Index('idx_processed_at', ['processedAt'])
export class CreditPurchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'revenuecat_event_id', unique: true, nullable: true })
  revenueCatEventId?: string; // RevenueCat event ID for deduplication

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'purchase_token', unique: true })
  purchaseToken: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ name: 'credits_awarded', type: 'int' })
  creditsAwarded: number;

  @Column({ name: 'amount_paid', type: 'decimal', precision: 10, scale: 2 })
  amountPaid: number;

  @Column({ length: 3, default: 'INR' })
  currency: string;

  @CreateDateColumn({ name: 'purchased_at' })
  purchasedAt: Date;

  @CreateDateColumn({ name: 'processed_at' })
  processedAt: Date;

  @Column({ name: 'revenue_cat_customer_id', nullable: true })
  revenueCatCustomerId?: string;

  @Column({ name: 'original_transaction_id', nullable: true })
  originalTransactionId?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
}
