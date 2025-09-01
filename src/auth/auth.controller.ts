import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RefreshTokenDto,
  SendOtpDto,
  VerifyOtpDto,
  UpdateFcmTokenDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Request } from 'express';

// Custom interface for request with user
interface RequestWithUser extends Request {
  user: any;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Send OTP to a phone number' })
  @ApiResponse({ status: HttpStatus.OK, description: 'OTP sent successfully' })
  @Post('sendOtp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(sendOtpDto.phoneNumber);
  }

  @ApiOperation({ summary: 'Verify OTP and login or create user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OTP verified and user authenticated successfully',
  })
  @Post('verifyOtp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtpAndLoginOrCreateUser(
      verifyOtpDto.tid,
      verifyOtpDto.otp,
      verifyOtpDto.fcmToken,
    );
  }

  @ApiOperation({ summary: 'Update FCM token for authenticated user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'FCM token updated successfully',
  })
  @UseGuards(JwtAuthGuard)
  @Post('updateFcmToken')
  @HttpCode(HttpStatus.OK)
  async updateFcmToken(
    @Req() req: RequestWithUser,
    @Body() updateFcmTokenDto: UpdateFcmTokenDto,
  ) {
    const userId = req.user.id;
    return this.authService.updateFcmToken(userId, updateFcmTokenDto.fcmToken);
  }

  @ApiOperation({ summary: 'Sign out from current session' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully signed out',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('signOut')
  @HttpCode(HttpStatus.OK)
  async signOut(@Req() req: RequestWithUser) {
    const userId = req.user.id;
    return this.authService.signOut(userId);
  }

  @ApiOperation({ summary: 'Refresh authentication tokens' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tokens refreshed successfully',
  })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }
}
