import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCreditOrderDto {
  @ApiProperty({
    description: 'Number of credits to purchase',
    example: 5,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  credits: number;

  @ApiProperty({
    description: 'Order currency',
    example: 'INR',
    default: 'INR',
  })
  @IsString()
  @IsOptional()
  currency?: string = 'INR';
}

export class VerifyPaymentDto {
  @ApiProperty({
    description: 'Order ID received from Cashfree',
    example: 'order_123456789',
  })
  @IsString()
  @IsNotEmpty()
  orderId: string;
}

export class CreditPackage {
  @ApiProperty({
    description: 'Credit package ID',
    example: 'basic',
  })
  id: string;

  @ApiProperty({
    description: 'Number of credits',
    example: 5,
  })
  credits: number;

  @ApiProperty({
    description: 'Price in INR',
    example: 50,
  })
  price: number;

  @ApiProperty({
    description: 'Package name',
    example: 'Basic Package',
  })
  name: string;

  @ApiProperty({
    description: 'Package description',
    example: '5 credits for creating or pledging to orders',
  })
  description: string;
}
