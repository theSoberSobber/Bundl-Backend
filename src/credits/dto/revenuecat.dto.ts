import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class RevenueCatPurchaseDto {
  @ApiProperty({
    description: 'Google Play product ID',
    example: 'bundle_5_credits',
  })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description: 'Google Play purchase token',
    example: 'abcdef123456...',
  })
  @IsString()
  @IsNotEmpty()
  purchaseToken: string;

  @ApiProperty({
    description: 'Original transaction ID from RevenueCat',
    example: 'rc_1234567890',
    required: false,
  })
  @IsString()
  @IsOptional()
  originalTransactionId?: string;
}

export class MigrationStatusDto {
  @ApiProperty({
    description: 'Current payment system in use',
    example: 'RevenueCat',
  })
  paymentSystem: 'RevenueCat';

  @ApiProperty({
    description: 'Whether RevenueCat is properly configured',
    example: true,
  })
  revenueCatConfigured: boolean;

  @ApiProperty({
    description: 'Migration phase information',
    required: false,
  })
  @IsOptional()
  migrationPhase?: {
    current: string;
    description: string;
    nextSteps: string[];
  };
}

export class PurchaseHistoryResponseDto {
  @ApiProperty({
    description: 'Purchase ID',
    example: 'uuid-here',
  })
  id: string;

  @ApiProperty({
    description: 'Product purchased',
    example: 'bundle_5_credits',
  })
  productId: string;

  @ApiProperty({
    description: 'Credits awarded',
    example: 5,
  })
  creditsAwarded: number;

  @ApiProperty({
    description: 'Amount paid',
    example: 5.00,
  })
  amountPaid: number;

  @ApiProperty({
    description: 'Currency code',
    example: 'INR',
  })
  currency: string;

  @ApiProperty({
    description: 'Purchase date',
    example: '2024-01-15T10:30:00Z',
  })
  processedAt: Date;

  @ApiProperty({
    description: 'Whether this purchase was refunded',
    required: false,
  })
  @IsOptional()
  refunded?: boolean;
}
