import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { APP_CONSTANTS } from '../constants/app.constants';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phoneNumber: string;

  @Column({ nullable: true })
  fcmToken: string;

  @Column({ default: APP_CONSTANTS.DEFAULT_USER_CREDITS })
  credits: number;

  @Column({ nullable: true })
  refreshToken: string;
}
