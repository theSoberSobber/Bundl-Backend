import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto, JoinChatDto, SendChatMessageDto } from './dto/chat.dto';
import { JwtService } from '@nestjs/jwt';
import { OrdersRedisService } from '../orders/services/orders-redis.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { EventsService } from '../services/events.service';

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    user?: any;
  };
}

@WebSocketGateway({
  cors: {
    origin: '*', // Configure this properly for production
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly ordersRedisService: OrdersRedisService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly eventsService: EventsService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Chat WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract and verify JWT token on connection
      const token = this.extractTokenFromClient(client);
      if (!token) {
        this.logger.warn(`Client ${client.id} connection rejected: No token provided`);
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token);
      client.data.userId = payload.sub;
      client.data.user = payload;

      this.logger.log(`Client ${client.id} connected with userId: ${client.data.userId}`);
    } catch (error) {
      this.logger.warn(`Client ${client.id} connection rejected: Invalid token`, error.message);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    console.log(`Client disconnected: ${client.id}`);
    
    // Get user info before cleanup
    const userId = client.data.userId;
    if (!userId) return;

    // Get all rooms this client was in
    const rooms = Array.from(client.rooms).filter(room => room.startsWith('order_'));
    
    // Send system messages for user leaving
    for (const room of rooms) {
      const orderId = room.replace('order_', '');
      
      const systemMessage = {
        id: `system_${Date.now()}`,
        orderId,
        content: `User left the chat`,
        senderId: 'system',
        senderName: 'System',
        timestamp: new Date(),
        type: 'system' as const,
        systemType: 'user_left' as const,
        userId,
      };

      // Broadcast to remaining users in the room
      client.to(room).emit('message', systemMessage);
    }
  }

  @SubscribeMessage('join_chat')
  async handleJoinChat(
    @MessageBody() data: JoinChatDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { orderId } = data;
    const userId = client.data.userId;

    try {
      if (!userId) {
        client.emit('error', { message: 'Authentication required' });
        return;
      }

      // Verify user is participant
      const isParticipant = await this.ordersRedisService.isParticipant(orderId, userId);
      if (!isParticipant) {
        client.emit('error', { message: 'Not authorized to join this chat' });
        return;
      }

      // Join the room
      await client.join(`order_${orderId}`);
      
      // Send system message instead of separate event
      const systemMessage = {
        id: `system_${Date.now()}`,
        orderId,
        content: `User joined the chat`,
        senderId: 'system',
        senderName: 'System',
        timestamp: new Date(),
        type: 'system' as const,
        systemType: 'user_joined' as const,
        userId, // Include userId for system messages
      };

      // Broadcast system message to all participants
      this.server.to(`order_${orderId}`).emit('message', systemMessage);

      client.emit('join_success', { orderId });
    } catch (error) {
      client.emit('error', { message: 'Failed to join chat' });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendChatMessageDto,
  ) {
    try {
      const { orderId, message } = data;
      const userId = client.data.userId; // Set in handleConnection

      if (!userId) {
        client.emit('error', { message: 'Authentication failed' });
        return;
      }

      if (!message || message.trim().length === 0) {
        client.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      if (message.length > 1000) { // Message length limit
        client.emit('error', { message: 'Message too long (max 1000 characters)' });
        return;
      }

      // Send message using chat service (includes participant verification)
      const sendMessageDto: SendMessageDto = {
        orderId,
        userId,
        message: message.trim(),
        type: 'USER_MESSAGE',
      };

      const chatMessage = await this.chatService.sendMessage(sendMessageDto);

      // Broadcast to all participants in the room
      this.server.to(`order_${orderId}`).emit('message', chatMessage);

      this.logger.log(`Message sent to order ${orderId} chat by user ${userId}: ${chatMessage.id}`);

      // Send FCM notifications to offline participants (non-blocking)
      this.sendChatMessageNotifications(orderId, message.trim(), userId)
        .catch(error => this.logger.error(`FCM notification failed for order ${orderId}:`, error.message));

    } catch (error) {
      this.logger.error(`Failed to send message for order ${data.orderId}:`, error.stack);
      client.emit('error', { message: error.message || 'Failed to send message' });
    }
  }

  // Utility method to send system messages to a chat room
  async sendSystemMessageToRoom(
    orderId: string, 
    content: string, 
    systemType: 'SYSTEM_MESSAGE' | 'ORDER_UPDATE' = 'SYSTEM_MESSAGE', 
    metadata?: Record<string, any>
  ) {
    try {
      // Store in Redis for message history using the chat service
      const chatMessage = await this.chatService.sendSystemMessage(orderId, content, systemType, metadata);

      // Create consistent system message format for WebSocket
      const systemMessage = {
        id: chatMessage.id,
        orderId,
        content,
        senderId: 'system',
        senderName: 'System',
        timestamp: chatMessage.timestamp,
        type: 'system' as const,
        systemType: systemType.toLowerCase().replace('_', '_'), // Normalize type
        metadata,
      };

      // Broadcast to all participants in the room
      this.server.to(`order_${orderId}`).emit('message', systemMessage);

      this.logger.log(`System message sent to order ${orderId} chat: ${content}`);

      return systemMessage;
    } catch (error) {
      this.logger.error(`Failed to send system message to order ${orderId}:`, error.stack);
      throw error;
    }
  }

  // Extract JWT token from client handshake
  private extractTokenFromClient(client: Socket): string | null {
    // Try to get token from handshake auth
    const token = client.handshake.auth?.token || 
                 client.handshake.headers?.authorization?.replace('Bearer ', '') ||
                 client.handshake.query?.token;

    return token as string || null;
  }

  // Performance-efficient method to find offline participants
  async getOfflineParticipants(orderId: string, senderUserId: string): Promise<string[]> {
    try {
      // Get all participants for this order
      const allParticipants = await this.ordersRedisService.getOrderParticipants(orderId);
      
      // Get users currently in the socket room (this is efficient - just a Set lookup)
      const roomName = `order_${orderId}`;
      const room = this.server.sockets.adapter.rooms.get(roomName);
      const onlineUserIds = new Set<string>();
      
      if (room) {
        // Extract user IDs from connected sockets in this room
        for (const socketId of room) {
          const socket = this.server.sockets.sockets.get(socketId) as AuthenticatedSocket;
          if (socket?.data?.userId) {
            onlineUserIds.add(socket.data.userId);
          }
        }
      }
      
      // Find participants who are not online in this room (excluding sender)
      const offlineParticipants = allParticipants.filter(userId => 
        userId !== senderUserId && !onlineUserIds.has(userId)
      );
      
      return offlineParticipants;
    } catch (error) {
      this.logger.error(`Failed to get offline participants for order ${orderId}:`, error.message);
      return []; // Return empty array on error to prevent blocking
    }
  }

  // Send FCM notifications for chat messages (following EventsService pattern)
  private async sendChatMessageNotifications(
    orderId: string, 
    message: string, 
    senderUserId: string
  ): Promise<void> {
    try {
      // Get offline participants (ChatGateway has the WebSocket server access)
      const offlineParticipants = await this.getOfflineParticipants(orderId, senderUserId);
      
      if (offlineParticipants.length === 0) {
        return; // No offline participants
      }

      // Call EventsService for pure FCM side effects
      await this.eventsService.handleChatMessage(offlineParticipants, {
        orderId,
        message,
        senderName: 'Someone', // Could enhance this with actual user name lookup
        messageType: 'chat_message',
      });

      this.logger.log(`FCM notifications sent for chat message in order ${orderId} to ${offlineParticipants.length} offline users`);
    } catch (error) {
      this.logger.error(`Failed to send FCM notifications for chat message in order ${orderId}:`, error.message);
      // Don't throw - FCM failures shouldn't break chat functionality
    }
  }
}
