import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

export enum OrderStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  COMPLETED = 'COMPLETED',
}

@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.ACTIVE
  })
  status: OrderStatus;

  @ManyToOne(() => User)
  @JoinColumn()
  creator: User;

  @Column()
  creatorId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amountNeeded: number;

  @Column('jsonb')
  pledgeMap: Record<string, number>;

  // Virtual property - not stored in database
  phoneNumberMap?: Record<string, number>;

  // Virtual property - not stored in database
  note?: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  totalPledge: number;

  @Column('int', { default: 0 })
  totalUsers: number;

  @Column()
  platform: string;

  @Column('decimal', { precision: 10, scale: 6 })
  latitude: number;

  @Column('decimal', { precision: 10, scale: 6 })
  longitude: number;
} 