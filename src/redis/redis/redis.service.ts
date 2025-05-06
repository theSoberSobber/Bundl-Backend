import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { Order } from '../../entities/order.entity';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class RedisService implements OnModuleInit {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Subscribe to keyspace events for expired keys
    const keyspaceChannel = '__keyevent@0__:expired';
    const subscriber = this.redis.duplicate();

    subscriber.on('message', (channel, message) => {
      if (channel === keyspaceChannel && message.startsWith('bundl:order:')) {
        const orderId = message.split(':')[2];
        // Emit an event for order expiry that will be handled by the Orders service
        this.eventEmitter.emit('order.expired', orderId);
        console.log(`Order expired: ${orderId}`);
      }
    });

    await subscriber.subscribe(keyspaceChannel);
  }

  // Store order with expiry (10 minutes)
  async storeOrder(order: Order, expirySeconds: number = 600): Promise<void> {
    const key = `order:${order.id}`;
    const serializedOrder = JSON.stringify(order);
    
    // Store order with expiry
    await this.redis.setex(key, expirySeconds, serializedOrder);
    
    // Add to geo index
    await this.redis.geoadd(
      'orders:geo',
      order.longitude,
      order.latitude,
      key
    );
  }

  // Get order by ID
  async getOrder(orderId: string): Promise<Order | null> {
    const key = `order:${orderId}`;
    const serializedOrder = await this.redis.get(key);
    
    if (!serializedOrder) {
      return null;
    }
    
    return JSON.parse(serializedOrder);
  }

  // Delete order (used when completed)
  async deleteOrder(orderId: string): Promise<void> {
    const key = `order:${orderId}`;
    
    // Remove from geo index
    await this.redis.zrem('orders:geo', key);
    
    // Delete the order
    await this.redis.del(key);
  }

  // Find orders near a location
  async findOrdersNear(
    longitude: number,
    latitude: number,
    radiusKm: number = 5
  ): Promise<Order[]> {
    const geoResults = await this.redis.georadius(
      'orders:geo',
      longitude,
      latitude,
      radiusKm,
      'km'
    ) as string[];
    
    if (!geoResults || geoResults.length === 0) {
      return [];
    }
    
    // Get all orders in parallel
    const orders = await Promise.all(
      geoResults.map(async (key) => {
        const serializedOrder = await this.redis.get(key);
        return serializedOrder ? JSON.parse(serializedOrder) : null;
      })
    );
    
    return orders.filter(Boolean);
  }

  // Run Lua script for atomic pledge operation
  async pledgeToOrder(
    orderId: string,
    userId: string,
    pledgeAmount: number
  ): Promise<{ success: boolean; message: string; updatedOrder?: Order }> {
    const script = `
      local key = KEYS[1]
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
      if order.totalPledge >= order.amountNeeded then
        return {false, 'Order is already fully pledged', nil}
      end
      
      -- Initialize pledge map if nil
      if not order.pledgeMap then
        order.pledgeMap = {}
      end
      
      -- Check if user already pledged
      local isNewUser = not order.pledgeMap[userId]
      
      -- Update pledge map
      order.pledgeMap[userId] = pledgeAmount
      
      -- Update total pledge and total users
      order.totalPledge = (order.totalPledge or 0) + pledgeAmount
      if isNewUser then
        order.totalUsers = (order.totalUsers or 0) + 1
      end
      
      -- Check if order is now completed
      if order.totalPledge >= order.amountNeeded then
        order.status = 'COMPLETED'
      end
      
      -- Save updated order
      local updatedOrder = cjson.encode(order)
      redis.call('SET', key, updatedOrder)
      
      -- If completed, remove from geo index and delete the order
      if order.status == 'COMPLETED' then
        redis.call('ZREM', 'orders:geo', key)
        redis.call('DEL', key)
      end
      
      return {true, 'Pledge successful', updatedOrder}
    `;
    
    try {
      const result = await this.redis.eval(
        script,
        1,
        `order:${orderId}`,
        userId,
        pledgeAmount.toString()
      ) as [boolean, string, string];
      
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
}
