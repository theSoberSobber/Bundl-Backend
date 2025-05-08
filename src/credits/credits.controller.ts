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
  ParseIntPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCreditOrderDto, VerifyPaymentDto, CreditPackage } from './dto/credits.dto';
import { CashfreeService } from '../services/cashfree.service';
import { CreditsService } from '../services/credits.service';
import { Logger } from '@nestjs/common';

@ApiTags('Credits')
@Controller('credits')
export class CreditsController {
  private readonly logger = new Logger(CreditsController.name);

  constructor(
    private readonly cashfreeService: CashfreeService,
    private readonly creditsService: CreditsService,
  ) {}

  @ApiOperation({ summary: 'Get available credit packages' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of available credit packages',
    type: CreditPackage,
    isArray: true
  })
  @Get('packages')
  getPackages() {
    return this.cashfreeService.getCreditPackages();
  }

  @ApiOperation({ summary: 'Get user credit balance' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User\'s current credit balance' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('balance')
  async getBalance(@Req() req) {
    const userId = req.user.id;
    const credits = await this.creditsService.getCredits(userId);
    return { credits };
  }

  @ApiOperation({ summary: 'Create a new payment order for credits' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Payment order created successfully' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('order')
  async createOrder(@Req() req, @Body() createOrderDto: CreateCreditOrderDto) {
    const userId = req.user.id;
    const user = await this.creditsService.findUserById(userId);
    
    if (!user) {
      throw new BadRequestException('User not found');
    }
    
    return this.cashfreeService.createOrder(
      userId, 
      createOrderDto.credits, 
      user.phoneNumber
    );
  }

  @ApiOperation({ summary: 'Check payment status (for client-side polling)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payment status for client-side use' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyPayment(@Body() verifyPaymentDto: VerifyPaymentDto) {
    const { orderId } = verifyPaymentDto;
    const verificationResult = await this.cashfreeService.verifyOrder(orderId);
    return verificationResult;
  }

  @ApiOperation({ summary: 'Handle webhook notifications from Cashfree' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Webhook processed' })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-version') version: string
  ) {
    this.logger.log(`Received webhook: ${payload.type}, Version: ${version}`);
    
    // Verify webhook signature
    const isValid = this.cashfreeService.verifyWebhookSignature(
      payload,
      signature,
      timestamp
    );
    
    if (!isValid) {
      this.logger.error('Invalid webhook signature received');
      throw new BadRequestException('Invalid webhook signature');
    }
    
    const webhookType = payload.type;
    const orderId = payload.data?.order?.order_id;
    const paymentStatus = payload.data?.payment?.payment_status;
    
    this.logger.log(`Processing webhook type: ${webhookType}, Order ID: ${orderId}, Payment Status: ${paymentStatus}`);
    
    // Handle different webhook types
    switch (webhookType) {
      case 'PAYMENT_SUCCESS_WEBHOOK':
        if (paymentStatus === 'SUCCESS') {
          const processed = await this.cashfreeService.processPaymentAtomically(orderId);
          return { 
            success: true, 
            message: processed ? 'Payment processed successfully' : 'Payment already processed'
          };
        }
        break;
        
      case 'PAYMENT_FAILED_WEBHOOK':
        // Log but don't process failed payments
        this.logger.warn(`Payment failed for order ${orderId}: ${payload.data?.payment?.payment_message}`);
        await this.cashfreeService.updateOrderStatus(orderId, 'FAILED');
        return { success: true, message: 'Failed payment recorded' };
        
      case 'PAYMENT_USER_DROPPED_WEBHOOK':
        // Log but don't process user-dropped payments
        this.logger.warn(`User dropped payment for order ${orderId}`);
        await this.cashfreeService.updateOrderStatus(orderId, 'DROPPED');
        return { success: true, message: 'User dropped payment recorded' };
    }
    
    // Default response for unhandled or unknown webhook types
    return { success: true, message: 'Webhook received' };
  }

  @ApiOperation({ summary: 'Calculate price for credits purchase' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns price calculation' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('calculatePrice')
  async calculatePrice(@Query('credits', ParseIntPipe) credits: number) {
    const totalAmount = this.cashfreeService.calculatePrice(credits);
    
    return {
      credits,
      pricePerCredit: {
        '0-5': 100,
        '5-10': 80,
        '10+': 60
      },
      totalAmount
    };
  }
}
