import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { RedisService } from '../redis/redis.service';
import { CreditsService } from '../credits/credits.service';
import { EventsService } from '../services/events.service';
import { CreateOrderDto, PledgeToOrderDto, GetOrdersNearDto } from './dto/order.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { APP_CONSTANTS } from '../constants/app.constants';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly creditsService: CreditsService,
    private readonly eventsService: EventsService,
  ) {}

  // Create a new order
  async createOrder(userId: string, createOrderDto: CreateOrderDto): Promise<Order> {
    // Check if user has enough credits
    const hasEnoughCredits = await this.creditsService.useCredits(userId, APP_CONSTANTS.CREDIT_COST_PER_ACTION);
    if (!hasEnoughCredits) {
      throw new BadRequestException('Not enough credits');
    }

    try {
      // Create new order
      const order = this.orderRepository.create({
        creatorId: userId,
        amountNeeded: createOrderDto.amountNeeded,
        platform: createOrderDto.platform,
        latitude: createOrderDto.latitude,
        longitude: createOrderDto.longitude,
        pledgeMap: {},
        totalPledge: 0,
        totalUsers: 0,
        status: OrderStatus.ACTIVE,
      });

      // Save order to database
      const savedOrder = await this.orderRepository.save(order);

      // If initial pledge was specified, add it
      if (createOrderDto.initialPledge && createOrderDto.initialPledge > 0) {
        savedOrder.pledgeMap = { [userId]: createOrderDto.initialPledge };
        savedOrder.totalPledge = createOrderDto.initialPledge;
        savedOrder.totalUsers = 1;
        
        // Update in database
        await this.orderRepository.save(savedOrder);
      }

      // Add to Redis with expiry
      const expirySeconds = createOrderDto.expirySeconds || APP_CONSTANTS.DEFAULT_ORDER_EXPIRY_SECONDS;
      await this.redisService.storeOrder(savedOrder, expirySeconds);

      return savedOrder;
    } catch (error) {
      // Refund credit if order creation fails
      await this.creditsService.addCredits(userId, APP_CONSTANTS.CREDIT_COST_PER_ACTION);
      throw error;
    }
  }

  // Pledge to an existing order
  async pledgeToOrder(userId: string, pledgeToOrderDto: PledgeToOrderDto): Promise<Order> {
    // Check if user has enough credits
    const hasEnoughCredits = await this.creditsService.useCredits(userId, APP_CONSTANTS.CREDIT_COST_PER_ACTION);
    if (!hasEnoughCredits) {
      throw new BadRequestException('Not enough credits');
    }

    try {
      // Use Redis Lua script for atomic operation
      const result = await this.redisService.pledgeToOrder(
        pledgeToOrderDto.orderId,
        userId,
        pledgeToOrderDto.pledgeAmount
      );

      if (!result.success) {
        await this.creditsService.addCredits(userId, APP_CONSTANTS.CREDIT_COST_PER_ACTION);
        await this.eventsService.handlePledgeFailure(userId, result.message);
        throw new BadRequestException(result.message);
      }

      const updatedOrder = result.updatedOrder as Order;

      // Update order in database
      await this.orderRepository.update(
        { id: updatedOrder.id },
        {
          pledgeMap: updatedOrder.pledgeMap,
          totalPledge: updatedOrder.totalPledge,
          totalUsers: updatedOrder.totalUsers,
          status: updatedOrder.status,
        }
      );

      // Send event for successful pledge
      await this.eventsService.handleSuccessfulPledge(updatedOrder, userId);

      // If order is completed, send completed event
      if (updatedOrder.status === OrderStatus.COMPLETED) {
        await this.eventsService.handleOrderCompleted(updatedOrder);
      }

      return updatedOrder;
    } catch (error) {
      // If it's not already a BadRequestException, refund the credit
      if (!(error instanceof BadRequestException)) {
        await this.creditsService.addCredits(userId, APP_CONSTANTS.CREDIT_COST_PER_ACTION);
      }
      throw error;
    }
  }

  // Get active orders near a location
  async getActiveOrdersNear(getOrdersNearDto: GetOrdersNearDto): Promise<Order[]> {
    return this.redisService.findOrdersNear(
      getOrdersNearDto.longitude,
      getOrdersNearDto.latitude,
      getOrdersNearDto.radiusKm
    );
  }

  // Get order status (with auth check)
  async getOrderStatus(userId: string, orderId: string): Promise<Order> {
    // Try to get from Redis first
    let order = await this.redisService.getOrder(orderId);

    // If not in Redis, get from database
    if (!order) {
      order = await this.orderRepository.findOne({ where: { id: orderId } });
      
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      
      // Don't re-add completed orders to Redis
      if (order.status !== OrderStatus.COMPLETED) {
        // Re-add to Redis with original expiry
        await this.redisService.storeOrder(order);
      }
    }

    // Check if user is a pledger in this order
    if (!order.pledgeMap[userId]) {
      throw new NotFoundException('Order not found or you are not a participant');
    }

    // If order is not completed, hide the pledgers information
    if (order.status !== OrderStatus.COMPLETED) {
      // Create a copy of the order with pledgeMap hidden
      const { pledgeMap, ...orderWithoutPledgeMap } = order;
      return {
        ...orderWithoutPledgeMap,
        // Just include the current user's pledge
        pledgeMap: { [userId]: pledgeMap[userId] },
      } as Order;
    }

    return order;
  }

  // Listen for order expiry events
  @OnEvent(APP_CONSTANTS.EVENTS.ORDER_EXPIRED)
  async handleOrderExpiryEvent(orderId: string): Promise<void> {
    console.log(`Handling order expiry event for order: ${orderId}`);
    await this.handleOrderExpiry(orderId);
  }

  // Handle expired order
  async handleOrderExpiry(orderId: string): Promise<void> {
    // Get order from database
    const order = await this.orderRepository.findOne({ where: { id: orderId } });

    if (!order) {
      return;
    }

    // Update order status
    order.status = OrderStatus.EXPIRED;
    await this.orderRepository.save(order);

    // Remove from Redis
    await this.redisService.deleteOrder(orderId);

    // Refund credit to creator
    await this.creditsService.addCredits(order.creatorId, APP_CONSTANTS.CREDIT_COST_PER_ACTION);
    
    // Refund credits to all other pledgers
    const pledgerIds = Object.keys(order.pledgeMap).filter(id => id !== order.creatorId);
    for (const pledgerId of pledgerIds) {
      try {
        await this.creditsService.addCredits(pledgerId, APP_CONSTANTS.CREDIT_COST_PER_ACTION);
        console.log(`Refunded ${APP_CONSTANTS.CREDIT_COST_PER_ACTION} credit to pledger ${pledgerId} for expired order ${orderId}`);
      } catch (error) {
        console.error(`Failed to refund credit to pledger ${pledgerId}: ${error.message}`);
      }
    }

    // Send expired event notification
    await this.eventsService.handleOrderExpired(order);
  }
}
