import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { RedisService } from '../redis/redis/redis.service';
import { CreditsService } from '../services/credits.service';
import { EventsService } from '../services/events.service';
import { CreateOrderDto, PledgeToOrderDto, GetOrdersNearDto } from './dto/order.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { In } from 'typeorm';

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
    const hasEnoughCredits = await this.creditsService.useCredits(userId, 1);
    if (!hasEnoughCredits) {
      throw new BadRequestException('Not enough credits');
    }

    try {
      // Check if initial pledge is enough to complete the order immediately
      const isCompleted = createOrderDto.initialPledge && 
                          createOrderDto.initialPledge >= createOrderDto.amountNeeded;
                          
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
        status: isCompleted ? OrderStatus.COMPLETED : OrderStatus.ACTIVE,
      });

      // Save order to database
      const savedOrder = await this.orderRepository.save(order);

      // Add initial pledge
      if (createOrderDto.initialPledge && createOrderDto.initialPledge > 0) {
        savedOrder.pledgeMap = { [userId]: createOrderDto.initialPledge };
        savedOrder.totalPledge = createOrderDto.initialPledge;
        savedOrder.totalUsers = 1;
        
        // Update in database
        await this.orderRepository.save(savedOrder);
      }

      // Only add to Redis if it's not completed
      if (!isCompleted) {
        // Add to Redis with expiry
        const expirySeconds = createOrderDto.expirySeconds || 600; // Default 10 minutes
        await this.redisService.storeOrder(savedOrder, expirySeconds);
        return savedOrder;
      } else {
        // Send event for completed order
        await this.eventsService.handleOrderCompleted(savedOrder);
        
        // Add phone numbers for completed order
        const phoneNumberMap = {};
        const pledgerIds = Object.keys(savedOrder.pledgeMap);
        
        try {
          // Get user data
          const user = await this.userRepository.findOne({ where: { id: userId } });
          
          if (user && user.phoneNumber) {
            // Create phoneNumberMap with the creator's phone number
            phoneNumberMap[user.phoneNumber] = savedOrder.pledgeMap[userId];
          }
          
          // Add note for completed order
          const note = `Order Completed Successfully with ${pledgerIds.length} pariticipants.`;
          
          // Return order with phone numbers and note
          return {
            ...savedOrder,
            phoneNumberMap,
            note
          };
        } catch (error) {
          console.error("Error fetching user data for phoneNumberMap:", error);
          // Return order without phoneNumberMap if there was an error
          return savedOrder;
        }
      }
    } catch (error) {
      // Refund credit if order creation fails
      await this.creditsService.addCredits(userId, 1);
      throw error;
    }
  }

  // Pledge to an existing order
  async pledgeToOrder(userId: string, pledgeToOrderDto: PledgeToOrderDto): Promise<Order> {
    // Check if user has enough credits
    const hasEnoughCredits = await this.creditsService.useCredits(userId, 1);
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
        await this.creditsService.addCredits(userId, 1);
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

      // If order is completed, add phoneNumberMap and note
      if (updatedOrder.status === OrderStatus.COMPLETED) {
        await this.eventsService.handleOrderCompleted(updatedOrder);
        
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
        await this.creditsService.addCredits(userId, 1);
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
  @OnEvent('order.expired')
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
    await this.creditsService.addCredits(order.creatorId, 1);
    
    // Refund credits to all other pledgers
    const pledgerIds = Object.keys(order.pledgeMap).filter(id => id !== order.creatorId);
    for (const pledgerId of pledgerIds) {
      try {
        await this.creditsService.addCredits(pledgerId, 1);
        console.log(`Refunded 1 credit to pledger ${pledgerId} for expired order ${orderId}`);
      } catch (error) {
        console.error(`Failed to refund credit to pledger ${pledgerId}: ${error.message}`);
      }
    }

    // Send expired event notification
    await this.eventsService.handleOrderExpired(order);
  }
}
