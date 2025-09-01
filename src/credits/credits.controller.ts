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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateCreditOrderDto,
  VerifyPaymentDto,
  CreditPackage,
} from './dto/credits.dto';
import { CashfreeService } from './services/cashfree.service';
import { CreditsService } from './credits.service';

@ApiTags('Credits')
@Controller('credits')
export class CreditsController {
  constructor(
    private readonly cashfreeService: CashfreeService,
    private readonly creditsService: CreditsService,
  ) {}

  @ApiOperation({ summary: 'Get available credit packages' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of available credit packages',
    type: CreditPackage,
    isArray: true,
  })
  @Get('packages')
  getPackages() {
    return this.cashfreeService.getCreditPackages();
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

  @ApiOperation({ summary: 'Create a new payment order for credits' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment order created successfully',
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

    return this.cashfreeService.createOrder(
      userId,
      createOrderDto.credits,
      user.phoneNumber,
    );
  }

  @ApiOperation({ summary: 'Check payment status (for client-side polling)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment status for client-side use',
  })
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
  ) {
    // Verify webhook signature
    const isValid = this.cashfreeService.verifyWebhookSignature(
      payload,
      signature,
      timestamp,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // Process payment notification atomically
    if (payload.data?.payment?.payment_status === 'SUCCESS') {
      const orderId = payload.data.order.order_id;
      const processed =
        await this.cashfreeService.processPaymentAtomically(orderId);

      return {
        success: true,
        message: processed
          ? 'Payment processed successfully'
          : 'Payment already processed',
      };
    }

    return { success: true, message: 'Webhook received' };
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
    const totalAmount = this.cashfreeService.calculatePrice(credits);

    return {
      credits,
      pricePerCredit: {
        '0-5': 100,
        '5-10': 80,
        '10+': 60,
      },
      totalAmount,
    };
  }
}
