import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { OrdersRedisService } from './services/orders-redis.service';
import { CreditsService } from '../credits/credits.service';
import { EventsService } from '../services/events.service';
import { GeohashLocationService } from '../services/geohash-location.service';
import {
  CreateOrderDto,
  PledgeToOrderDto,
  GetOrdersNearDto,
} from './dto/order.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { APP_CONSTANTS } from '../constants/app.constants';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly ordersRedisService: OrdersRedisService,
    private readonly creditsService: CreditsService,
    private readonly eventsService: EventsService,
    private readonly geohashLocationService: GeohashLocationService,
  ) {}

  // Create a new order
  async createOrder(
    userId: string,
    createOrderDto: CreateOrderDto,
  ): Promise<Order> {
    // Check if user has enough credits
    const hasEnoughCredits = await this.creditsService.useCredits(
      userId,
      APP_CONSTANTS.CREDIT_COST_PER_ACTION,
    );
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
      const expirySeconds =
        createOrderDto.expirySeconds ||
        APP_CONSTANTS.DEFAULT_ORDER_EXPIRY_SECONDS;
      await this.ordersRedisService.storeOrder(savedOrder, expirySeconds);

      // Send geohash-based notifications to nearby users
      try {
        const notificationResult = await this.geohashLocationService.notifyNearbyUsers(
          savedOrder.latitude,
          savedOrder.longitude,
          savedOrder.id,
          savedOrder.platform,
          savedOrder.amountNeeded,
        );
        
        this.logger.log(
          `Order ${savedOrder.id} notifications: ${notificationResult.successful}/${notificationResult.totalTopics} topics successful`
        );
      } catch (error) {
        // Don't fail order creation if notification fails
        this.logger.error(
          `Failed to send notifications for order ${savedOrder.id}:`,
          error.stack,
        );
      }

      return savedOrder;
    } catch (error) {
      // Refund credit if order creation fails
      await this.creditsService.addCredits(
        userId,
        APP_CONSTANTS.CREDIT_COST_PER_ACTION,
      );
      throw error;
    }
  }

  // Pledge to an existing order
  async pledgeToOrder(
    userId: string,
    pledgeToOrderDto: PledgeToOrderDto,
  ): Promise<Order> {
    // Check if user has enough credits
    const hasEnoughCredits = await this.creditsService.useCredits(
      userId,
      APP_CONSTANTS.CREDIT_COST_PER_ACTION,
    );
    if (!hasEnoughCredits) {
      throw new BadRequestException('Not enough credits');
    }

    try {
      // Use Redis Lua script for atomic operation
      const result = await this.ordersRedisService.pledgeToOrder(
        pledgeToOrderDto.orderId,
        userId,
        pledgeToOrderDto.pledgeAmount,
      );

      if (!result.success) {
        await this.creditsService.addCredits(
          userId,
          APP_CONSTANTS.CREDIT_COST_PER_ACTION,
        );
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
        },
      );

      // Send event for successful pledge
      await this.eventsService.handleSuccessfulPledge(updatedOrder, userId);

      // Send geohash-based notifications for order updates
      try {
        const pledgePercentage = Math.round((updatedOrder.totalPledge / updatedOrder.amountNeeded) * 100);
        const notificationResult = await this.geohashLocationService.notifyNearbyUsers(
          updatedOrder.latitude,
          updatedOrder.longitude,
          updatedOrder.id,
          updatedOrder.platform,
          updatedOrder.amountNeeded,
          'pledge_update',
          { pledgePercentage: pledgePercentage.toString() },
        );
        
        this.logger.log(
          `Order ${updatedOrder.id} pledge update notifications: ${notificationResult.successful}/${notificationResult.totalTopics} topics successful (${pledgePercentage}% complete)`
        );
      } catch (error) {
        // Don't fail pledge if notification fails
        this.logger.error(
          `Failed to send pledge update notifications for order ${updatedOrder.id}:`,
          error.stack,
        );
      }

      // If order is completed, send completed event
      if (updatedOrder.status === OrderStatus.COMPLETED) {
        await this.eventsService.handleOrderCompleted(updatedOrder);
        
        // Send completion notification to nearby users
        try {
          const notificationResult = await this.geohashLocationService.notifyNearbyUsers(
            updatedOrder.latitude,
            updatedOrder.longitude,
            updatedOrder.id,
            updatedOrder.platform,
            updatedOrder.amountNeeded,
            'order_completed',
          );
          
          this.logger.log(
            `Order ${updatedOrder.id} completion notifications: ${notificationResult.successful}/${notificationResult.totalTopics} topics successful`
          );
        } catch (error) {
          this.logger.error(
            `Failed to send completion notifications for order ${updatedOrder.id}:`,
            error.stack,
          );
        }

        // Add phone numbers for all users
        const phoneNumberMap = {};
        const pledgerIds = Object.keys(updatedOrder.pledgeMap);
        
        // Get all users in a single query
        try {
          const users = await this.userRepository.find({
            where: { id: In(pledgerIds) }
          });
          
          // Create phoneNumberMap
          users.forEach(user => {
            if (user && user.phoneNumber && updatedOrder.pledgeMap[user.id]) {
              phoneNumberMap[user.phoneNumber] = updatedOrder.pledgeMap[user.id];
            }
          });
          
          // Add note for completed order
          const note = `Order Completed Successfully with ${pledgerIds.length} pariticipants.`;
          
          // Return order with phone numbers and note
          return {
            ...updatedOrder,
            phoneNumberMap,
            note
          };
        } catch (error) {
          console.error("Error fetching user data for phoneNumberMap:", error);
          // Return order without phoneNumberMap if there was an error
          return updatedOrder;
        }
      }

      return updatedOrder;
    } catch (error) {
      // If it's not already a BadRequestException, refund the credit
      if (!(error instanceof BadRequestException)) {
        await this.creditsService.addCredits(
          userId,
          APP_CONSTANTS.CREDIT_COST_PER_ACTION,
        );
      }
      throw error;
    }
  }

  // Get active orders near a location
  async getActiveOrdersNear(
    getOrdersNearDto: GetOrdersNearDto,
  ): Promise<Order[]> {
    return this.ordersRedisService.findOrdersNear(
      getOrdersNearDto.longitude,
      getOrdersNearDto.latitude,
      getOrdersNearDto.radiusKm,
    );
  }

  // Get order status (with auth check)
  async getOrderStatus(userId: string, orderId: string): Promise<Order> {
    // Try to get from Redis first
    let order = await this.ordersRedisService.getOrder(orderId);

    // If not in Redis, get from database
    if (!order) {
      order = await this.orderRepository.findOne({ where: { id: orderId } });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      // Don't re-add completed orders to Redis
      if (order.status !== OrderStatus.COMPLETED) {
        // Re-add to Redis with original expiry
        await this.ordersRedisService.storeOrder(order);
      }
    }

    // Check if user is a pledger in this order
    if (!order.pledgeMap[userId]) {
      throw new NotFoundException(
        'Order not found or you are not a participant',
      );
    }

    // For completed orders, add phone numbers - REGARDLESS OF PARTICIPANT COUNT
    if (order.status === OrderStatus.COMPLETED) {
      // Add phone numbers for all users
      const phoneNumberMap = {};
      const pledgerIds = Object.keys(order.pledgeMap);
      
      try {
        // Get all users in a single query
        const users = await this.userRepository.find({
          where: { id: In(pledgerIds) }
        });
        
        // Create phoneNumberMap
        users.forEach(user => {
          if (user && user.phoneNumber && order.pledgeMap[user.id]) {
            phoneNumberMap[user.phoneNumber] = order.pledgeMap[user.id];
          }
        });
        
        // Add note for completed order
        const note = `Order Completed Successfully with ${pledgerIds.length} pariticipants.`;
        
        // Return order with phone numbers and note
        return {
          ...order,
          phoneNumberMap,
          note
        };
      } catch (error) {
        console.error("Error fetching user data for phoneNumberMap:", error);
        // Return order without phoneNumberMap if there was an error
        return order;
      }
    }
    
    // For expired orders, add a note
    if (order.status === OrderStatus.EXPIRED) {
      return {
        ...order,
        note: "Refunded 1 credit back for expiry"
      };
    }

    // If order is still active, hide other pledgers information
    if (order.status === OrderStatus.ACTIVE) {
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
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      return;
    }

    // Update order status
    order.status = OrderStatus.EXPIRED;
    await this.orderRepository.save(order);

    // Remove from Redis
    await this.ordersRedisService.deleteOrder(orderId);

    // Refund credit to creator
    await this.creditsService.addCredits(
      order.creatorId,
      APP_CONSTANTS.CREDIT_COST_PER_ACTION,
    );

    // Refund credits to all other pledgers
    const pledgerIds = Object.keys(order.pledgeMap).filter(
      (id) => id !== order.creatorId,
    );
    for (const pledgerId of pledgerIds) {
      try {
        await this.creditsService.addCredits(
          pledgerId,
          APP_CONSTANTS.CREDIT_COST_PER_ACTION,
        );
        console.log(
          `Refunded ${APP_CONSTANTS.CREDIT_COST_PER_ACTION} credit to pledger ${pledgerId} for expired order ${orderId}`,
        );
      } catch (error) {
        console.error(
          `Failed to refund credit to pledger ${pledgerId}: ${error.message}`,
        );
      }
    }

    // Send expired event notification
    await this.eventsService.handleOrderExpired(order);
  }
}
