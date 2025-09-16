import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatRedisService {
  private readonly logger = new Logger(ChatRedisService.name);
  private readonly isDebugEnabled: boolean;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.isDebugEnabled = this.configService.get<string>('DEBUG_ENABLED') === 'true';
  }

  /**
   * Atomically check if user is participant and get debug info
   * Returns: { isParticipant: boolean, participants?: string[], ttl?: number }
   */
  async atomicParticipantCheck(orderId: string, userId: string): Promise<{
    isParticipant: boolean;
    participants?: string[];
    ttl?: number;
  }> {
    const participantsKey = `order:${orderId}:participants`;

    // Lua script for atomic participant check with optional debug info
    const luaScript = `
      local participantsKey = KEYS[1]
      local userId = ARGV[1]
      local debugMode = ARGV[2]
      
      -- Check if key exists
      if redis.call('EXISTS', participantsKey) == 0 then
        return { 0, nil, -1 } -- not participant, no participants, no ttl
      end
      
      -- Check if user is member
      local isMember = redis.call('SISMEMBER', participantsKey, userId)
      
      if debugMode == "true" then
        -- Get all participants and TTL for debug
        local participants = redis.call('SMEMBERS', participantsKey)
        local ttl = redis.call('TTL', participantsKey)
        return { isMember, participants, ttl }
      else
        -- Only return membership status
        return { isMember, nil, -1 }
      end
    `;

    try {
      const result = await this.redis.eval(
        luaScript,
        1, // number of keys
        participantsKey, // KEYS[1]
        userId, // ARGV[1]
        this.isDebugEnabled ? 'true' : 'false' // ARGV[2]
      ) as [number, string[] | null, number];

      const [isMember, participants, ttl] = result;

      this.logger.log(
        `🔍 Atomic participant check for user ${userId} in order ${orderId}: ${isMember === 1 ? 'ALLOWED' : 'DENIED'}`
      );

      if (this.isDebugEnabled && participants) {
        this.logger.log(
          `🐛 [DEBUG] Order ${orderId} participants: [${participants.join(', ')}], TTL: ${ttl}s`
        );
      }

      return {
        isParticipant: isMember === 1,
        participants: this.isDebugEnabled ? participants || undefined : undefined,
        ttl: this.isDebugEnabled ? ttl : undefined,
      };
    } catch (error) {
      this.logger.error(`❌ Atomic participant check failed: ${error.message}`);
      return { isParticipant: false };
    }
  }

  /**
   * Get all participants for an order (for FCM notifications)
   */
  async getOrderParticipants(orderId: string): Promise<string[]> {
    const participantsKey = `order:${orderId}:participants`;
    
    try {
      const participants = await this.redis.smembers(participantsKey);
      return participants;
    } catch (error) {
      this.logger.error(`❌ Failed to get order participants: ${error.message}`);
      return [];
    }
  }
}
