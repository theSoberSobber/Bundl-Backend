import { Injectable, Logger } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatEventsService {
  private readonly logger = new Logger(ChatEventsService.name);

  constructor(private readonly chatGateway: ChatGateway) {}

  // Essential order lifecycle events for chat notifications

  async onUserJoinedOrder(orderId: string, userId: string, userName?: string): Promise<void> {
    try {
      const displayName = userName || 'A user';
      await this.chatGateway.sendSystemMessageToRoom(
        orderId,
        `${displayName} joined the order! 👋`,
        'SYSTEM_MESSAGE',
        {
          eventType: 'user_joined_order',
          userId,
          userName,
        }
      );
      
      this.logger.log(`User joined notification sent to chat ${orderId} for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send user joined notification for ${orderId}:`, error.message);
    }
  }

  async onOrderExpired(orderId: string, reason?: string): Promise<void> {
    try {
      const message = reason 
        ? `❌ Order has expired. Reason: ${reason}`
        : `❌ Order has expired.`;
        
      await this.chatGateway.sendSystemMessageToRoom(
        orderId,
        message,
        'ORDER_UPDATE',
        {
          eventType: 'order_expired',
          reason,
          expiredAt: new Date().toISOString(),
        }
      );
      
      this.logger.log(`Order expired notification sent to chat ${orderId}`);
    } catch (error) {
      this.logger.error(`Failed to send order expired notification for ${orderId}:`, error.message);
    }
  }
}
