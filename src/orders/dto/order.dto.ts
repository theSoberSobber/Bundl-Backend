import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  IsLatitude,
  IsLongitude,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderDto {
  @ApiProperty({
    description: 'Amount needed for the order',
    example: 100.5,
  })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amountNeeded: number;

  @ApiProperty({
    description: 'Platform of the order (e.g., Swiggy, Zomato)',
    example: 'Zomato',
  })
  @IsString()
  platform: string;

  @ApiProperty({
    description: 'Latitude of the order location',
    example: 12.9716,
  })
  @IsLatitude()
  @Type(() => Number)
  latitude: number;

  @ApiProperty({
    description: 'Longitude of the order location',
    example: 77.5946,
  })
  @IsLongitude()
  @Type(() => Number)
  longitude: number;

  @ApiProperty({
    description: 'Initial pledge amount by creator',
    example: 50,
    required: false,
  })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  @IsOptional()
  initialPledge?: number;

  @ApiProperty({
    description: 'Expiry time in seconds (default: 600 seconds = 10 minutes)',
    example: 600,
    required: false,
  })
  @IsNumber()
  @Min(60)
  @Type(() => Number)
  @IsOptional()
  expirySeconds?: number;
}

export class PledgeToOrderDto {
  @ApiProperty({
    description: 'ID of the order to pledge to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  orderId: string;

  @ApiProperty({
    description: 'Amount to pledge',
    example: 50,
  })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  pledgeAmount: number;
}

export class GetOrdersNearDto {
  @ApiProperty({
    description: 'Latitude of the current location',
    example: 12.9716,
  })
  @IsLatitude()
  @Type(() => Number)
  latitude: number;

  @ApiProperty({
    description: 'Longitude of the current location',
    example: 77.5946,
  })
  @IsLongitude()
  @Type(() => Number)
  longitude: number;

  @ApiProperty({
    description: 'Radius in kilometers to search',
    example: 5,
    required: false,
  })
  @IsNumber()
  @Min(0.1)
  @Type(() => Number)
  @IsOptional()
  radiusKm?: number;
}

export class OrderStatusDto {
  @ApiProperty({
    description: 'ID of the order to get status for',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  orderId: string;

  @ApiProperty({
    description: 'Map of phone numbers to pledge amounts (only for completed orders)',
    example: {
      '+919770483089': 48,
      '+911234567890': 50,
      '+910987654321': 16
    },
    required: false
  })
  phoneNumberMap?: Record<string, number>;

  @ApiProperty({
    description: 'Note about the order status (for completed or expired orders)',
    example: 'Order Completed Successfully with 3 pariticipants.',
    required: false
  })
  note?: string;
}
