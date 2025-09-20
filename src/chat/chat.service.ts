import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { APP_CONSTANTS } from '../constants/app.constants';

export interface ChatMessage {
  messageId: string;
  orderId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
}

export interface StoredChatMessage {
  user?: string;
  username?: string;
  message?: string;
  timestamp?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Store a chat message in Redis Streams with TTL matching participant set
   */
  async storeChatMessage(
    orderId: string,
    userId: string,
    username: string,
    message: string,
  ): Promise<string> {
    const timestamp = Date.now();
    const chatStreamKey = `${APP_CONSTANTS.REDIS_KEYS.CHAT_STREAM_PREFIX}${orderId}`;
    const participantsKey = `${APP_CONSTANTS.REDIS_KEYS.ORDER_PARTICIPANTS_PREFIX}${orderId}:participants`;

    try {
      // Store message in Redis stream
      const messageId = await this.redis.xadd(
        chatStreamKey,
        '*', // Auto-generate ID
        'user', userId,
        'username', username,
        'message', message,
        'timestamp', timestamp.toString(),
      );

      this.logger.log(`💾 Stored message ${messageId} in ${chatStreamKey}`);

      // Note: Chat stream has no independent TTL
      // It's managed by order lifecycle via Lua scripts:
      // - On completion: 5-minute grace period set by pledgeToOrder script
      // - On expiry: Immediate deletion by atomicExpireOrder script

      return messageId as string;
    } catch (error) {
      this.logger.error(`❌ Failed to store chat message: ${error.message}`);
      throw new Error('Failed to store message');
    }
  }

  /**
   * Get chat history for an order with pagination support
   */
  async getChatHistory(
    orderId: string, 
    options: {
      count?: number;
      before?: string;
      after?: string;
      direction?: 'newer' | 'older';
    } = {}
  ): Promise<{
    messages: ChatMessage[];
    hasMore: boolean;
    oldestMessageId?: string;
    newestMessageId?: string;
  }> {
    const chatStreamKey = `${APP_CONSTANTS.REDIS_KEYS.CHAT_STREAM_PREFIX}${orderId}`;
    const { count = 50, before, after, direction = 'older' } = options;

    try {
      let messages: any[];
      
      if (direction === 'older') {
        // Get older messages (pagination backwards)
        const endId = before || '+';  // Start from specific message or newest
        messages = await this.redis.xrevrange(
          chatStreamKey,
          endId,
          '-',        // Go to oldest
          'COUNT', count + 1  // Get one extra to check if there are more
        );
      } else {
        // Get newer messages (pagination forwards)
        const startId = after || '-'; // Start from specific message or oldest
        messages = await this.redis.xrange(
          chatStreamKey,
          startId,
          '+',        // Go to newest
          'COUNT', count + 1  // Get one extra to check if there are more
        );
      }

      // Check if there are more messages
      const hasMore = messages.length > count;
      if (hasMore) {
        messages.pop(); // Remove the extra message
      }

      const chatMessages: ChatMessage[] = [];
      for (const [messageId, fields] of messages) {
        const messageData: StoredChatMessage = {};
        
        for (let i = 0; i < fields.length; i += 2) {
          messageData[fields[i]] = fields[i + 1];
        }

        chatMessages.push({
          messageId,
          orderId,
          userId: messageData.user || '',
          username: messageData.username || '',
          message: messageData.message || '',
          timestamp: parseInt(messageData.timestamp || '0'),
        });
      }

      // For XREVRANGE, reverse to get chronological order
      if (direction === 'older') {
        chatMessages.reverse();
      }

      return {
        messages: chatMessages,
        hasMore,
        oldestMessageId: chatMessages.length > 0 ? chatMessages[0].messageId : undefined,
        newestMessageId: chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].messageId : undefined,
      };

    } catch (error) {
      this.logger.error(`❌ Failed to get chat history: ${error.message}`);
      return { messages: [], hasMore: false };
    }
  }

  /**
   * Legacy method for backwards compatibility
   */
  async getChatHistorySimple(orderId: string, count: number = 50): Promise<ChatMessage[]> {
    const result = await this.getChatHistory(orderId, { count, direction: 'older' });
    return result.messages;
  }

  /**
   * Generate anonymous username for a user in a specific order
   * Uses deterministic hashing so same user gets same name in same order
   */
  generateAnonymousUsername(userId: string, orderId: string): string {
    // Create deterministic hash from userId + orderId
    const hash = crypto
      .createHash('sha256')
      .update(`${userId}-${orderId}`)
      .digest('hex');

    // Use first 8 characters for username generation
    const hashNum = parseInt(hash.substring(0, 8), 16);

    const adjectives = [
      'Swift', 'Brave', 'Calm', 'Wise', 'Bold', 'Quick', 'Sharp', 'Bright',
      'Smart', 'Cool', 'Fast', 'Strong', 'Lucky', 'Happy', 'Fresh', 'Pure',
      'Clear', 'Warm', 'Kind', 'Fair', 'True', 'Free', 'Wild', 'Safe',
    ];

    const animals = [
      'Tiger', 'Eagle', 'Wolf', 'Fox', 'Bear', 'Lion', 'Hawk', 'Deer',
      'Owl', 'Cat', 'Dog', 'Bird', 'Fish', 'Duck', 'Frog', 'Bee',
      'Ant', 'Crab', 'Seal', 'Dove', 'Swan', 'Crow', 'Bat', 'Ram',
    ];

    const adjIndex = hashNum % adjectives.length;
    const animalIndex = Math.floor(hashNum / adjectives.length) % animals.length;

    const username = `${adjectives[adjIndex]}${animals[animalIndex]}`;
    
    this.logger.log(`🎭 Generated username '${username}' for user ${userId} in order ${orderId}`);
    return username;
  }
}
