import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Query,
  ParseIntPipe,
  Logger,
  RawBody,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateCreditOrderDto,
  CreditPackage,
} from './dto/credits.dto';
import { RevenueCatService, RevenueCatWebhookEvent } from './services/revenuecat.service';
import { CreditsService } from './credits.service';

@ApiTags('Credits')
@Controller('credits')
export class CreditsController {
  private readonly logger = new Logger(CreditsController.name);

  constructor(
    private readonly revenueCatService: RevenueCatService,
    private readonly creditsService: CreditsService,
    private readonly configService: ConfigService,
  ) {
    this.logger.log('Payment system: RevenueCat');
  }

  @ApiOperation({ summary: 'Get available credit packages' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of available credit packages',
    type: CreditPackage,
    isArray: true,
  })
  @Get('packages')
  getPackages() {
    return this.revenueCatService.getCreditPackages();
  }

  @ApiOperation({ summary: 'Get user credit balance' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "User's current credit balance",
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('balance')
  async getBalance(@Req() req) {
    const userId = req.user.id;
    const credits = await this.creditsService.getCredits(userId);
    return { credits };
  }

  @ApiOperation({ summary: 'Get credit package info for mobile app purchase' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Credit package information for Google Play purchase',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('order')
  async createOrder(@Req() req, @Body() createOrderDto: CreateCreditOrderDto) {
    const userId = req.user.id;
    const user = await this.creditsService.findUserById(userId);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const packages = this.revenueCatService.getCreditPackages();
    const matchingPackage = packages.find(pkg => pkg.credits === createOrderDto.credits);
    
    if (!matchingPackage) {
      throw new BadRequestException('Invalid credit package');
    }
    
    return {
      message: 'Use Google Play Billing directly from the app',
      productId: matchingPackage.productId,
      credits: matchingPackage.credits,
      price: matchingPackage.price,
      instructions: 'Complete purchase through Google Play in the mobile app'
    };
  }

  @ApiOperation({ summary: 'Handle webhook notifications from RevenueCat' })
  @ApiResponse({ status: HttpStatus.OK, description: 'RevenueCat webhook processed' })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleRevenueCatWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('authorization') authHeader: string,
  ) {
    this.logger.log('Received RevenueCat webhook');
    
    try {
      const payload = rawBody.toString('utf8');
      
      // Verify webhook authorization (RevenueCat best practice)
      const isValid = this.revenueCatService.verifyWebhookAuthorization(authHeader);
      
      if (!isValid) {
        this.logger.error('Invalid RevenueCat webhook authorization');
        throw new BadRequestException('Invalid webhook authorization');
      }
      
      const event: RevenueCatWebhookEvent = JSON.parse(payload);
      this.logger.log(`Processing RevenueCat event: ${event.event.type} (${event.event.id}) for user ${event.event.app_user_id}`);
      
      // RevenueCat Best Practice: Process with deferred pattern (respond quickly <60s, defer heavy operations)
      const result = await this.revenueCatService.processWebhookEvent(event);
      
      return {
        success: result.success,
        message: result.success ? 'Event processed successfully' : 'Event processing failed'
      };
    } catch (error) {
      this.logger.error('Error processing RevenueCat webhook:', error);
      throw new BadRequestException('Failed to process webhook');
    }
  }

  @ApiOperation({ summary: 'Calculate price for credits purchase' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns price calculation',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('calculatePrice')
  async calculatePrice(@Query('credits', ParseIntPipe) credits: number) {
    const totalAmount = this.revenueCatService.calculatePrice(credits);
    
    return {
      credits,
      pricePerCredit: {
        '1-4': 1.2,    // ₹1.2 per credit for 1-4 credits
        '5-9': 1.0,    // ₹1.0 per credit for 5-9 credits
        '10-19': 0.8,  // ₹0.8 per credit for 10-19 credits
        '20+': 0.6     // ₹0.6 per credit for 20+ credits
      },
      totalAmount,
      paymentSystem: 'RevenueCat'
    };
  }

  @ApiOperation({ summary: 'Get user purchase history' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns user purchase history',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getPurchaseHistory(@Req() req, @Query('limit', ParseIntPipe) limit = 10) {
    const userId = req.user.id;
    return await this.revenueCatService.getUserPurchaseHistory(userId, limit);
  }

  @ApiOperation({ summary: 'Get system health and configuration' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'System health check',
  })
  @Get('health')
  getHealth() {
    return {
      paymentSystem: 'RevenueCat',
      revenueCatConfigured: this.revenueCatService.isConfigured(),
      status: 'healthy'
    };
  }
}
