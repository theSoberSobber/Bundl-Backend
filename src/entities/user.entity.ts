import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phoneNumber: string;

  @Column({ nullable: true })
  fcmToken: string;

  @Column({ default: 5 })
  credits: number;

  @Column({ nullable: true })
  refreshToken: string;
} 