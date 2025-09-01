import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateOrderDto,
  PledgeToOrderDto,
  GetOrdersNearDto,
} from './dto/order.dto';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Order created successfully',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('createOrder')
  async createOrder(@Req() req, @Body() createOrderDto: CreateOrderDto) {
    const userId = req.user.id;
    return this.ordersService.createOrder(userId, createOrderDto);
  }

  @ApiOperation({ summary: 'Pledge to an existing order' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Pledge successful' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('pledgeToOrder')
  @HttpCode(HttpStatus.OK)
  async pledgeToOrder(@Req() req, @Body() pledgeToOrderDto: PledgeToOrderDto) {
    const userId = req.user.id;
    return this.ordersService.pledgeToOrder(userId, pledgeToOrderDto);
  }

  @ApiOperation({ summary: 'Get active orders near a location' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns list of active orders',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('activeOrders')
  async getActiveOrders(@Query() getOrdersNearDto: GetOrdersNearDto) {
    return this.ordersService.getActiveOrdersNear(getOrdersNearDto);
  }

  @ApiOperation({ summary: 'Get status of a specific order' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns order status' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('orderStatus/:orderId')
  async getOrderStatus(@Req() req, @Param('orderId') orderId: string) {
    const userId = req.user.id;
    return this.ordersService.getOrderStatus(userId, orderId);
  }
}
