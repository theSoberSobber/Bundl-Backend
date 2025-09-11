import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { APP_CONSTANTS } from '../constants/app.constants';
import { OrdersRedisService } from '../orders/services/orders-redis.service';
import { ChatMessage, SendMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly ordersRedisService: OrdersRedisService,
  ) {}

  // Send a message to the order chat stream (ATOMIC)
  async sendMessage(sendMessageDto: SendMessageDto): Promise<ChatMessage> {
    const { orderId, userId, message, type = 'USER_MESSAGE', metadata } = sendMessageDto;

    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`;
    const streamKey = `${APP_CONSTANTS.REDIS_KEYS.CHAT_STREAM_PREFIX}${orderId}`;
    const timestamp = Date.now();

    // Atomic Lua script to check participant and add message
    const script = `
      local participantsKey = KEYS[1]
      local streamKey = KEYS[2]
      local userId = ARGV[1]
      local message = ARGV[2]
      local messageType = ARGV[3]
      local timestamp = ARGV[4]
      local metadata = ARGV[5]
      
      -- Check if user is a participant (atomic check)
      local isParticipant = redis.call('SISMEMBER', participantsKey, userId)
      if isParticipant == 0 and userId ~= 'SYSTEM' then
        return {false, 'User is not a participant in this order', nil}
      end
      
      -- Prepare message data
      local messageData = {'userId', userId, 'message', message, 'type', messageType, 'timestamp', timestamp}
      if metadata ~= '' then
        table.insert(messageData, 'metadata')
        table.insert(messageData, metadata)
      end
      
      -- Add message to stream
      local messageId = redis.call('XADD', streamKey, '*', unpack(messageData))
      if not messageId then
        return {false, 'Failed to generate message ID', nil}
      end
      
      -- Set stream expiry (extends TTL if already set)
      redis.call('EXPIRE', streamKey, ARGV[6])
      
      return {true, 'Message sent successfully', messageId}
    `;

    try {
      const result = (await this.redis.eval(
        script,
        2, // 2 keys
        participantsKey,
        streamKey,
        userId,
        message,
        type,
        timestamp.toString(),
        metadata ? JSON.stringify(metadata) : '',
        APP_CONSTANTS.CHAT.COMPLETION_GRACE_PERIOD.toString(),
      )) as [boolean, string, string | null];

      if (!result[0]) {
        throw new Error(result[1]);
      }

      const chatMessage: ChatMessage = {
        id: result[2]!,
        orderId,
        senderId: userId,
        senderName: userId === 'SYSTEM' ? 'System' : undefined,
        message,
        type: type === 'USER_MESSAGE' ? 'user' : 'system' as const,
        timestamp: new Date(timestamp),
        metadata,
      };

      this.logger.log(`Message sent to order ${orderId} chat: ${result[2]}`);
      return chatMessage;
    } catch (error) {
      this.logger.error(`Failed to send message to order ${orderId}:`, error.stack);
      throw new Error('Failed to send message');
    }
  }

  // Get chat history for an order (ATOMIC)
  async getChatHistory(
    orderId: string,
    userId: string,
    limit: number = 50,
    startId?: string,
  ): Promise<ChatMessage[]> {
    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`;
    const streamKey = `${APP_CONSTANTS.REDIS_KEYS.CHAT_STREAM_PREFIX}${orderId}`;

    // Atomic Lua script to check participant and get messages
    const script = `
      local participantsKey = KEYS[1]
      local streamKey = KEYS[2]
      local userId = ARGV[1]
      local limit = tonumber(ARGV[2])
      local startId = ARGV[3]
      
      -- Check if user is a participant (atomic check)
      local isParticipant = redis.call('SISMEMBER', participantsKey, userId)
      if isParticipant == 0 then
        return {false, 'User is not a participant in this order', {}}
      end
      
      -- Check if stream exists
      local streamExists = redis.call('EXISTS', streamKey)
      if streamExists == 0 then
        return {true, 'No messages found', {}}
      end
      
      -- Read messages from stream
      local messages
      if startId ~= '' then
        messages = redis.call('XREVRANGE', streamKey, '+', startId, 'COUNT', limit)
      else
        messages = redis.call('XREVRANGE', streamKey, '+', '-', 'COUNT', limit)
      end
      
      return {true, 'Messages retrieved successfully', messages}
    `;

    try {
      const result = (await this.redis.eval(
        script,
        2, // 2 keys
        participantsKey,
        streamKey,
        userId,
        limit.toString(),
        startId || '',
      )) as [boolean, string, any[]];

      if (!result[0]) {
        throw new Error(result[1]);
      }

      const messages = result[2];

      // Parse messages into ChatMessage format
      const chatMessages: ChatMessage[] = messages.map(([id, fields]: [string, string[]]) => {
        const messageData: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          messageData[fields[i]] = fields[i + 1];
        }

        return {
          id,
          orderId,
          senderId: messageData.userId,
          senderName: messageData.userId === 'SYSTEM' ? 'System' : undefined,
          message: messageData.message,
          type: messageData.type === 'USER_MESSAGE' ? 'user' : 'system' as const,
          timestamp: new Date(parseInt(messageData.timestamp, 10)),
          metadata: messageData.metadata ? JSON.parse(messageData.metadata) : undefined,
        };
      });

      // Reverse to get chronological order (xrevrange returns newest first)
      return chatMessages.reverse();
    } catch (error) {
      this.logger.error(`Failed to get chat history for order ${orderId}:`, error.stack);
      throw new Error('Failed to retrieve chat history');
    }
  }

  // Send system message (for order updates, completion, etc.)
  async sendSystemMessage(
    orderId: string,
    message: string,
    type: 'SYSTEM_MESSAGE' | 'ORDER_UPDATE' = 'SYSTEM_MESSAGE',
    metadata?: Record<string, any>,
  ): Promise<ChatMessage> {
    return this.sendMessage({
      orderId,
      userId: 'SYSTEM',
      message,
      type,
      metadata,
    });
  }

  // Check if chat stream exists for an order
  async chatExists(orderId: string): Promise<boolean> {
    const streamKey = `${APP_CONSTANTS.REDIS_KEYS.CHAT_STREAM_PREFIX}${orderId}`;
    
    try {
      const exists = await this.redis.exists(streamKey);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Failed to check if chat exists for order ${orderId}:`, error.stack);
      return false;
    }
  }

  // Get stream info (for debugging/monitoring)
  async getStreamInfo(orderId: string): Promise<any> {
    const streamKey = `${APP_CONSTANTS.REDIS_KEYS.CHAT_STREAM_PREFIX}${orderId}`;
    
    try {
      const info = await this.redis.xinfo('STREAM', streamKey);
      return info;
    } catch (error) {
      this.logger.error(`Failed to get stream info for order ${orderId}:`, error.stack);
      return null;
    }
  }

  // Clean up chat stream (called when order completes)
  async cleanupChatStream(orderId: string): Promise<void> {
    const streamKey = `${APP_CONSTANTS.REDIS_KEYS.CHAT_STREAM_PREFIX}${orderId}`;
    
    try {
      // Set expiry for automatic cleanup after grace period
      await this.redis.expire(streamKey, APP_CONSTANTS.CHAT.COMPLETION_GRACE_PERIOD);
      
      this.logger.log(`Chat stream cleanup scheduled for order ${orderId} in ${APP_CONSTANTS.CHAT.COMPLETION_GRACE_PERIOD} seconds`);
    } catch (error) {
      this.logger.error(`Failed to schedule cleanup for order ${orderId}:`, error.stack);
    }
  }

  // Get recent messages since a specific message ID (for real-time updates) (ATOMIC)
  async getMessagesSince(
    orderId: string,
    userId: string,
    sinceId: string,
  ): Promise<ChatMessage[]> {
    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`;
    const streamKey = `${APP_CONSTANTS.REDIS_KEYS.CHAT_STREAM_PREFIX}${orderId}`;

    // Atomic Lua script to check participant and get messages since ID
    const script = `
      local participantsKey = KEYS[1]
      local streamKey = KEYS[2]
      local userId = ARGV[1]
      local sinceId = ARGV[2]
      
      -- Check if user is a participant (atomic check)
      local isParticipant = redis.call('SISMEMBER', participantsKey, userId)
      if isParticipant == 0 then
        return {false, 'User is not a participant in this order', {}}
      end
      
      -- Check if stream exists
      local streamExists = redis.call('EXISTS', streamKey)
      if streamExists == 0 then
        return {true, 'No messages found', {}}
      end
      
      -- Read messages from after the given ID
      local messages = redis.call('XRANGE', streamKey, '(' .. sinceId, '+')
      
      return {true, 'Messages retrieved successfully', messages}
    `;

    try {
      const result = (await this.redis.eval(
        script,
        2, // 2 keys
        participantsKey,
        streamKey,
        userId,
        sinceId,
      )) as [boolean, string, any[]];

      if (!result[0]) {
        throw new Error(result[1]);
      }

      const messages = result[2];

      // Parse messages into ChatMessage format
      const chatMessages: ChatMessage[] = messages.map(([id, fields]: [string, string[]]) => {
        const messageData: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          messageData[fields[i]] = fields[i + 1];
        }

        return {
          id,
          orderId,
          senderId: messageData.userId,
          senderName: messageData.userId === 'SYSTEM' ? 'System' : undefined,
          message: messageData.message,
          type: messageData.type === 'USER_MESSAGE' ? 'user' : 'system' as const,
          timestamp: new Date(parseInt(messageData.timestamp, 10)),
          metadata: messageData.metadata ? JSON.parse(messageData.metadata) : undefined,
        };
      });

      return chatMessages;
    } catch (error) {
      this.logger.error(`Failed to get messages since ${sinceId} for order ${orderId}:`, error.stack);
      throw new Error('Failed to retrieve recent messages');
    }
  }
}
