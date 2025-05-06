import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token received during authentication',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class SendOtpDto {
  @ApiProperty({
    description: 'Phone number to send OTP to',
    example: '+1234567890'
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Transaction ID received when sending OTP',
    example: 'abc123def456'
  })
  @IsString()
  @IsNotEmpty()
  tid: string;

  @ApiProperty({
    description: 'OTP entered by the user',
    example: '123456'
  })
  @IsString()
  @IsNotEmpty()
  otp: string;

  @ApiProperty({
    description: 'Firebase Cloud Messaging token for push notifications',
    example: 'eiD7a-GzQxCLphT5h1...',
    required: false
  })
  @IsString()
  @IsOptional()
  fcmToken?: string;
}

export class UpdateFcmTokenDto {
  @ApiProperty({
    description: 'Firebase Cloud Messaging token for push notifications',
    example: 'eiD7a-GzQxCLphT5h1...'
  })
  @IsString()
  @IsNotEmpty()
  fcmToken: string;
} 