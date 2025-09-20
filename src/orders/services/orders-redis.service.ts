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
    // Subscribe to Redis keyspace events for expired keys
    const keyspaceChannel = '__keyevent@0__:expired';
    const subscriber = this.redis.duplicate();

    subscriber.on('message', (channel, message) => {
      console.log(`📨 Keyspace event received - Channel: ${channel}, Message: ${message}`);
      
      // Check if this is an expired order key
      // Expected message format: 'bundl:order:uuid-here'
      // Example: 'bundl:order:123e4567-e89b-12d3-a456-426614174000'
      if (
        channel === keyspaceChannel &&
        message.startsWith(`${APP_CONSTANTS.REDIS_KEYS.REDIS_PREFIX}${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}`)
      ) {
        // Extract orderId from 'bundl:order:uuid' -> get the 'uuid' part
        const orderId = message.split(':')[2]; // Split by ':' and take index 2
        console.log(`🎯 Order expiry detected for orderId: ${orderId}`);
        // Emit an event for order expiry that will be handled by the Orders service
        this.eventEmitter.emit(APP_CONSTANTS.EVENTS.ORDER_EXPIRED, orderId);
        console.log(`📤 Emitted ORDER_EXPIRED event for: ${orderId}`);
      } else {
        console.log(`❌ Keyspace event ignored - Channel: ${channel}, Message: ${message}, Expected prefix: ${APP_CONSTANTS.REDIS_KEYS.REDIS_PREFIX}${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}`);
      }
    });

    await subscriber.subscribe(keyspaceChannel);
  }

  // Store order with expiry (default 10 minutes)
  // 
  // KEY FORMATS CREATED:
  // 1. Order data: 'bundl:order:uuid' -> JSON serialized order
  // 2. Geo set entry: 'order:uuid' (stored in 'bundl:orders:geo' set) - NOTE: NO bundl prefix!
  // 3. Participants set: 'bundl:order:uuid:participants' -> Set of user IDs
  //
  // Example keys created for order 123e4567-e89b-12d3-a456-426614174000:
  // - 'bundl:order:123e4567-e89b-12d3-a456-426614174000' (order data)
  // - 'bundl:order:123e4567-e89b-12d3-a456-426614174000:participants' (participants set)
  // - Geo set member: 'order:123e4567-e89b-12d3-a456-426614174000' (in 'bundl:orders:geo')
  async storeOrder(
    order: Order,
    expirySeconds: number = APP_CONSTANTS.DEFAULT_ORDER_EXPIRY_SECONDS,
  ): Promise<void> {
    // Create order key: 'bundl:order:uuid'
    const key = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${order.id}`;
    const serializedOrder = JSON.stringify(order);

    // Store order with expiry
    await this.redis.setex(key, expirySeconds, serializedOrder);

    // Add to geo index
    // IMPORTANT: We store 'order:uuid' in the geo set (WITHOUT bundl prefix!)
    // This is because geo sets are shared data structures and the prefix is in the set name
    await this.redis.geoadd(
      APP_CONSTANTS.REDIS_KEYS.ORDERS_GEO_KEY, // 'bundl:orders:geo'
      order.longitude,
      order.latitude,
      key, // 'order:uuid' - this is what gets stored as the geo set member
    );

    // Create participants set and add creator
    // Key format: 'bundl:order:uuid:participants'
    // Note: No independent TTL - managed by order lifecycle via Lua scripts:
    // - On completion: 5-minute grace period set by pledgeToOrder script
    // - On expiry: Immediate deletion by atomicExpireOrder script
    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${order.id}:participants`;
    await this.redis.sadd(participantsKey, order.creatorId);
  }

  // Get order by ID from Redis
  // Key format: 'bundl:order:uuid'
  async getOrder(orderId: string): Promise<Order | null> {
    const key = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${orderId}`;
    const serializedOrder = await this.redis.get(key);

    if (!serializedOrder) {
      return null;
    }

    return JSON.parse(serializedOrder);
  }

  // Delete order (used when manually completed)
  // 
  // KEYS DELETED:
  // 1. Order data: 'bundl:order:uuid'
  // 2. Participants set: 'bundl:order:uuid:participants' 
  // 3. Geo set member: 'order:uuid' (removed from 'bundl:orders:geo')
  async deleteOrder(orderId: string): Promise<void> {
    const key = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${orderId}`;
    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`;

    // Remove from geo index - IMPORTANT: Use 'order:uuid' format (without bundl prefix)
    await this.redis.zrem(APP_CONSTANTS.REDIS_KEYS.ORDERS_GEO_KEY, key);

    // Delete the order and participants
    await this.redis.del(key);
    await this.redis.del(participantsKey);
  }

  // Find orders near a location using Redis GEORADIUS
  // 
  // GEO SET STRUCTURE:
  // - Set name: 'bundl:orders:geo'
  // - Members: 'order:uuid' (without bundl prefix!)
  // - Values: geohash coordinates
  // 
  // RETURNS: Array of Order objects within radius
  async findOrdersNear(
    longitude: number,
    latitude: number,
    radiusKm: number = APP_CONSTANTS.DEFAULT_SEARCH_RADIUS_KM,
  ): Promise<Order[]> {
    // Get geo results - returns array of 'order:uuid' strings
    const geoResults = (await this.redis.georadius(
      APP_CONSTANTS.REDIS_KEYS.ORDERS_GEO_KEY, // 'bundl:orders:geo'
      longitude,
      latitude,
      radiusKm,
      'km',
    )) as string[];

    if (!geoResults || geoResults.length === 0) {
      return [];
    }

    // Get all orders in parallel
    // Each geoResult is 'order:uuid', so we need to fetch 'bundl:order:uuid'
    const orders = await Promise.all(
      geoResults.map(async (key) => {
        // key is 'order:uuid', we need to get 'bundl:order:uuid'
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
      local geoKey = KEYS[3]
      local chatKey = KEYS[4]
      local userId = ARGV[1]
      local pledgeAmount = tonumber(ARGV[2])
      local orderId = ARGV[3]
      
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
      
      -- If completed, remove from geo index, delete order but keep participants for 5min grace period
      if order.status == 'COMPLETED' then
        -- CRITICAL: Construct geo key in correct format
        -- Geo set contains 'order:uuid' (without bundl prefix!)
        -- This must match the format used in storeOrder method
        local orderGeoKey = 'order:' .. orderId
        redis.call('ZREM', geoKey, orderGeoKey) -- Remove 'order:uuid' from 'bundl:orders:geo'
        redis.call('DEL', key) -- Delete 'bundl:order:uuid'
        -- Keep participants for 5 minutes (300 seconds) for chat grace period
        redis.call('EXPIRE', participantsKey, 300) -- 'bundl:order:uuid:participants'
        -- Also keep chat data for the same grace period
        redis.call('EXPIRE', chatKey, 300) -- 'bundl:chat:uuid'
      end
      
      return {true, 'Pledge successful', updatedOrder}
    `;

    try {
      const result = (await this.redis.eval(
        script,
        4, // Now using 4 keys
        `${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${orderId}`,
        `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`,
        APP_CONSTANTS.REDIS_KEYS.ORDERS_GEO_KEY,
        `${APP_CONSTANTS.REDIS_KEYS.CHAT_STREAM_PREFIX}${orderId}`,
        userId,
        pledgeAmount.toString(),
        orderId,
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

  // Atomic order expiry to prevent race conditions
  // 
  // TRIGGERED BY: Redis keyspace events when 'bundl:order:uuid' key expires
  // 
  // KEYS CLEANED UP:
  // 1. Order data: 'bundl:order:uuid' (KEYS[1])
  // 2. Participants: 'bundl:order:uuid:participants' (KEYS[2])
  // 3. Chat data: 'bundl:chat:uuid' (KEYS[4])
  // 4. Geo set member: 'order:uuid' (removed from KEYS[3] = 'bundl:orders:geo')
  // 
  // CRITICAL: Geo set contains 'order:uuid' format (without bundl prefix!)
  async atomicExpireOrder(orderId: string): Promise<string[]> {
    const script = `
      local orderKey = KEYS[1]      -- 'bundl:order:uuid'
      local participantsKey = KEYS[2]  -- 'bundl:order:uuid:participants'
      local geoKey = KEYS[3]        -- 'bundl:orders:geo'
      local chatKey = KEYS[4]       -- 'bundl:chat:uuid'
      local orderId = ARGV[1]       -- uuid string
      
      -- Check if order exists before cleanup
      local orderExists = redis.call('EXISTS', orderKey)
      if orderExists == 0 then
        -- Order doesn't exist, return empty result
        return {}
      end
      
      -- Get participants before cleanup
      local participants = redis.call('SMEMBERS', participantsKey)
      
      -- CRITICAL: Construct the correct geo set key format
      -- Geo set contains 'order:uuid' (same format as in pledgeToOrder and storeOrder)
      -- This MUST match the format used when storing in geo set
      local orderGeoKey = 'order:' .. orderId
      
      -- Atomic cleanup: Remove all traces of the order
      redis.call('DEL', orderKey)             -- Remove 'bundl:order:uuid'
      redis.call('DEL', participantsKey)     -- Remove 'bundl:order:uuid:participants'
      redis.call('DEL', chatKey)             -- Remove 'bundl:chat:uuid'
      redis.call('ZREM', geoKey, orderGeoKey) -- Remove 'order:uuid' from 'bundl:orders:geo'
      
      -- Return participant list for credit refund
      return participants
    `;
    
    console.log("Expiry got triggered!!!!!!!!!!!!");

    // Debug log showing exact key formats being used
    console.log(`Trying to delete order key: bundl:${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${orderId}`);
    console.log(`Trying to delete geo member: ${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${orderId}`);
    console.log(`From geo set: bundl:${APP_CONSTANTS.REDIS_KEYS.ORDERS_GEO_KEY}`);

    // Execute Lua script with proper key formats
    const participants = (await this.redis.eval(
      script,
      4, // 4 keys total
      `${APP_CONSTANTS.REDIS_KEYS.ORDER_PREFIX}${orderId}`,        // KEYS[1]: 'bundl:order:uuid'
      `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`, // KEYS[2]: 'bundl:order:uuid:participants'
      APP_CONSTANTS.REDIS_KEYS.ORDERS_GEO_KEY,                    // KEYS[3]: 'bundl:orders:geo'
      `${APP_CONSTANTS.REDIS_KEYS.CHAT_STREAM_PREFIX}${orderId}`,     // KEYS[4]: 'bundl:chat:uuid'
      orderId  // ARGV[1]: uuid string for constructing 'order:uuid' geo member
    )) as string[];
    
    return participants || [];
  }
}
