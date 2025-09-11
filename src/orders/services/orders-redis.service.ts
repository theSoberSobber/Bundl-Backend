import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { Order } from '../../entities/order.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { APP_CONSTANTS } from '../../constants/app.constants';

@Injectable()
export class OrdersRedisService implements OnModuleInit {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Subscribe to keyspace events for expired keys
    const keyspaceChannel = '__keyevent@0__:expired';
    const subscriber = this.redis.duplicate();

    subscriber.on('message', (channel, message) => {
      if (
        channel === keyspaceChannel &&
        message.startsWith(`bundl:${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}`)
      ) {
        const orderId = message.split(':')[2];
        // Emit an event for order expiry that will be handled by the Orders service
        this.eventEmitter.emit(APP_CONSTANTS.EVENTS.ORDER_EXPIRED, orderId);
        console.log(`Order expired: ${orderId}`);
      }
    });

    await subscriber.subscribe(keyspaceChannel);
  }

  // Store order with expiry (10 minutes)
  async storeOrder(
    order: Order,
    expirySeconds: number = APP_CONSTANTS.DEFAULT_ORDER_EXPIRY_SECONDS,
  ): Promise<void> {
    const key = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${order.id}`;
    const serializedOrder = JSON.stringify(order);

    // Store order with expiry
    await this.redis.setex(key, expirySeconds, serializedOrder);

    // Add to geo index
    await this.redis.geoadd(
      APP_CONSTANTS.REDIS_KEYS.ORDERS_GEO_KEY,
      order.longitude,
      order.latitude,
      key,
    );

    // Create participants set and add creator
    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${order.id}:participants`;
    await this.redis.sadd(participantsKey, order.creatorId);
    await this.redis.expire(participantsKey, expirySeconds);
  }

  // Get order by ID
  async getOrder(orderId: string): Promise<Order | null> {
    const key = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${orderId}`;
    const serializedOrder = await this.redis.get(key);

    if (!serializedOrder) {
      return null;
    }

    return JSON.parse(serializedOrder);
  }

  // Delete order (used when completed)
  async deleteOrder(orderId: string): Promise<void> {
    const key = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${orderId}`;
    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`;

    // Remove from geo index
    await this.redis.zrem(APP_CONSTANTS.REDIS_KEYS.ORDERS_GEO_KEY, key);

    // Delete the order and participants
    await this.redis.del(key);
    await this.redis.del(participantsKey);
  }

  // Find orders near a location
  async findOrdersNear(
    longitude: number,
    latitude: number,
    radiusKm: number = APP_CONSTANTS.DEFAULT_SEARCH_RADIUS_KM,
  ): Promise<Order[]> {
    const geoResults = (await this.redis.georadius(
      APP_CONSTANTS.REDIS_KEYS.ORDERS_GEO_KEY,
      longitude,
      latitude,
      radiusKm,
      'km',
    )) as string[];

    if (!geoResults || geoResults.length === 0) {
      return [];
    }

    // Get all orders in parallel
    const orders = await Promise.all(
      geoResults.map(async (key) => {
        const serializedOrder = await this.redis.get(key);
        return serializedOrder ? JSON.parse(serializedOrder) : null;
      }),
    );

    return orders.filter(Boolean);
  }

  // Run Lua script for atomic pledge operation
  async pledgeToOrder(
    orderId: string,
    userId: string,
    pledgeAmount: number,
  ): Promise<{ success: boolean; message: string; updatedOrder?: Order }> {
    const script = `
      local key = KEYS[1]
      local participantsKey = KEYS[2]
      local userId = ARGV[1]
      local pledgeAmount = tonumber(ARGV[2])
      
      -- Check if order exists
      local serializedOrder = redis.call('GET', key)
      if not serializedOrder then
        return {false, 'Order not found', nil}
      end
      
      -- Parse order
      local order = cjson.decode(serializedOrder)
      
      -- Check if order is ACTIVE
      if order.status ~= 'ACTIVE' then
        return {false, 'Order is not active', nil}
      end
      
      -- Check if already completed
      local orderAmount = tonumber(order.amountNeeded)
      local orderPledge = tonumber(order.totalPledge or 0)
      
      if orderPledge >= orderAmount then
        return {false, 'Order is already fully pledged', nil}
      end
      
      -- Initialize pledge map if nil
      if not order.pledgeMap then
        order.pledgeMap = {}
      end
      
      -- Check if user already pledged (to track new users)
      local isNewUser = not order.pledgeMap[userId]
      local currentPledge = tonumber(order.pledgeMap[userId] or 0)
      
      -- Update pledge map - ADD to existing pledge instead of replacing
      order.pledgeMap[userId] = currentPledge + pledgeAmount
      
      -- Update total pledge and total users
      order.totalPledge = orderPledge + pledgeAmount
      if isNewUser then
        order.totalUsers = tonumber(order.totalUsers or 0) + 1
        -- Add user to participants set
        redis.call('SADD', participantsKey, userId)
      end
      
      -- Check if order is now completed
      if order.totalPledge >= orderAmount then
        order.status = 'COMPLETED'
      end
      
      -- Save updated order
      local updatedOrder = cjson.encode(order)
      redis.call('SET', key, updatedOrder)
      
      -- If completed, remove from geo index and delete the order and participants
      if order.status == 'COMPLETED' then
        redis.call('ZREM', 'orders:geo', key)
        redis.call('DEL', key)
        redis.call('DEL', participantsKey)
      end
      
      return {true, 'Pledge successful', updatedOrder}
    `;

    try {
      const result = (await this.redis.eval(
        script,
        2, // Now using 2 keys
        `${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${orderId}`,
        `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`,
        userId,
        pledgeAmount.toString(),
      )) as [boolean, string, string];

      if (!result[0]) {
        return { success: false, message: result[1] };
      }

      return {
        success: true,
        message: result[1],
        updatedOrder: JSON.parse(result[2]),
      };
    } catch (error: any) {
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  // === PARTICIPANT MANAGEMENT FOR CHAT ===
  
  // Get all participants for an order (creator + pledgers)
  async getOrderParticipants(orderId: string): Promise<string[]> {
    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`;
    return await this.redis.smembers(participantsKey);
  }

  // Check if user is a participant (for chat authorization)
  async isParticipant(orderId: string, userId: string): Promise<boolean> {
    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`;
    const result = await this.redis.sismember(participantsKey, userId);
    return result === 1;
  }

  // Extend participants set TTL (when order completes)
  async extendParticipantsTTL(orderId: string, additionalSeconds: number): Promise<void> {
    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`;
    await this.redis.expire(participantsKey, additionalSeconds);
  }

  // Atomic order expiry to prevent race conditions
  async atomicExpireOrder(orderId: string): Promise<string[]> {
    const script = `
      local orderKey = KEYS[1]
      local participantsKey = KEYS[2]  
      local geoKey = KEYS[3]
      
      -- Get participants before cleanup
      local participants = redis.call('SMEMBERS', participantsKey)
      
      -- Atomic cleanup: Remove all traces of the order
      redis.call('DEL', orderKey)           -- Remove order data
      redis.call('DEL', participantsKey)   -- Remove participants
      redis.call('ZREM', geoKey, orderKey) -- Remove from geo index
      
      -- Return participant list for credit refund
      return participants
    `;
    
    const participants = (await this.redis.eval(
      script,
      3,
      `${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${orderId}`,
      `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`,
      APP_CONSTANTS.REDIS_KEYS.ORDERS_GEO_KEY
    )) as string[];
    
    return participants || [];
  }
}
