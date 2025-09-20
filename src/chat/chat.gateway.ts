import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, Injectable } from '@nestjs/common';
import { Server } from 'ws';
import * as WebSocket from 'ws';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service';
import { ChatService } from './chat.service';
import { ChatRedisService } from './chat-redis.service';
import { FcmService } from '../services/fcm/fcm.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAuthenticated?: boolean;
}

interface ChatMessage {
  orderId: string;
  message: string;
  timestamp?: number;
}

interface JoinOrderRequest {
  orderId: string;
}

@WebSocketGateway({
  path: '/chat',
  cors: {
    origin: '*',
    credentials: true,
  },
})
@Injectable()
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private connectedClients = new Map<WebSocket, string>(); // WebSocket -> userId
  private orderRooms = new Map<string, Set<WebSocket>>(); // orderId -> Set<WebSocket>

  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
    private readonly chatRedisService: ChatRedisService,
    private readonly fcmService: FcmService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  afterInit(server: Server) {
    this.logger.log('🚀 Chat WebSocket Gateway initialized');
    this.logger.log(`🔗 WebSocket endpoint available at: ws://localhost:3000/chat`);
  }

  async handleConnection(client: AuthenticatedWebSocket, request: any) {
    this.logger.log('🔌 New WebSocket connection attempt');

    try {
      // Extract token from query parameters or headers
      const url = new URL(request.url, 'http://localhost');
      const token = url.searchParams.get('token') || 
                   request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('❌ No authentication token provided');
        client.close(1008, 'Authentication required');
        return;
      }

      this.logger.log(`🔐 Validating token: ${token.substring(0, 10)}...`);

      // Verify JWT token
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn('❌ Invalid token payload');
        client.close(1008, 'Invalid token');
        return;
      }

      // Check if token is blacklisted
      const isBlacklisted = await this.authService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        this.logger.warn(`❌ Token is blacklisted for user ${userId}`);
        client.close(1008, 'Token is blacklisted');
        return;
      }

      // Mark client as authenticated
      client.userId = userId;
      client.isAuthenticated = true;
      this.connectedClients.set(client, userId);

      this.logger.log(`✅ User ${userId} authenticated and connected`);

      // Send authentication success message
      client.send(JSON.stringify({
        type: 'auth_success',
        message: 'Successfully authenticated',
        userId: userId,
      }));

    } catch (error) {
      this.logger.error(`❌ Authentication failed: ${error.message}`);
      client.close(1008, 'Authentication failed');
    }
  }

  handleDisconnect(client: AuthenticatedWebSocket) {
    const userId = this.connectedClients.get(client);
    if (userId) {
      this.logger.log(`👋 User ${userId} disconnected`);
      
      // Remove from all order rooms
      for (const [orderId, clients] of this.orderRooms.entries()) {
        if (clients.has(client)) {
          clients.delete(client);
          this.logger.log(`📤 User ${userId} left order room ${orderId}`);
          
          // Clean up empty rooms
          if (clients.size === 0) {
            this.orderRooms.delete(orderId);
            this.logger.log(`🗑️ Removed empty order room ${orderId}`);
          }
        }
      }
      
      this.connectedClients.delete(client);
    }
  }

  @SubscribeMessage('join_order')
  async handleJoinOrder(
    @ConnectedSocket() client: AuthenticatedWebSocket,
    @MessageBody() data: JoinOrderRequest,
  ) {
    if (!client.isAuthenticated || !client.userId) {
      this.sendError(client, 'Not authenticated');
      return;
    }

    const { orderId } = data;
    const userId = client.userId;

    this.logger.log(`🚪 User ${userId} attempting to join order ${orderId}`);

    try {
      // Atomically check if user is a participant (with debug info if enabled)
      const participantCheck = await this.chatRedisService.atomicParticipantCheck(orderId, userId);
      
      if (!participantCheck.isParticipant) {
        this.logger.warn(`❌ User ${userId} is not a participant in order ${orderId}`);
        
        // If debug enabled, show participant info even for unauthorized access
        if (participantCheck.participants && participantCheck.ttl !== undefined) {
          const debugInfo = {
            participants: participantCheck.participants,
            participantCount: participantCheck.participants.length,
            ttlSeconds: participantCheck.ttl,
            currentUser: userId,
            isParticipant: false
          };
          
          this.logger.log(`🐛 [DEBUG] Order ${orderId} debug info for unauthorized user ${userId}:`, debugInfo);
          
          // Send error with debug info
          client.send(JSON.stringify({
            type: 'error',
            message: 'This order has either expired or more than 5 minutes have passed since its completion',
            debug: debugInfo
          }));
        } else {
          this.sendError(client, 'This order has either expired or more than 5 minutes have passed since its completion');
        }
        return;
      }

      // Add client to order room
      if (!this.orderRooms.has(orderId)) {
        this.orderRooms.set(orderId, new Set());
      }
      this.orderRooms.get(orderId)!.add(client);

      this.logger.log(`✅ User ${userId} joined order room ${orderId}`);

      // Generate anonymous username for this user  
      const anonymousUsername = this.chatService.generateAnonymousUsername(userId, orderId);

      // Prepare join success response
      const joinResponse: any = {
        type: 'join_success',
        orderId: orderId,
        message: `Joined order ${orderId} chat`,
        username: anonymousUsername, // Send user's anonymous username
      };

      // Add debug info if enabled
      if (participantCheck.participants && participantCheck.ttl !== undefined) {
        joinResponse.debug = {
          participants: participantCheck.participants,
          participantCount: participantCheck.participants.length,
          ttlSeconds: participantCheck.ttl,
        };
        this.logger.log(`🐛 [DEBUG] Order ${orderId} debug info sent to client`);
      }

      // Send success response
      client.send(JSON.stringify(joinResponse));

      // Send chat history from Redis Streams
      const chatHistoryResult = await this.chatService.getChatHistory(orderId, { count: 50 });
      if (chatHistoryResult.messages.length > 0) {
        client.send(JSON.stringify({
          type: 'chat_history',
          orderId: orderId,
          messages: chatHistoryResult.messages,
          hasMore: chatHistoryResult.hasMore,
          oldestMessageId: chatHistoryResult.oldestMessageId,
          newestMessageId: chatHistoryResult.newestMessageId,
        }));
      }

      this.logger.log(`📖 Sent ${chatHistoryResult.messages.length} historical messages to user ${userId}`);

    } catch (error) {
      this.logger.error(`❌ Error joining order room: ${error.message}`);
      this.sendError(client, 'Failed to join order chat');
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedWebSocket,
    @MessageBody() data: ChatMessage,
  ) {
    if (!client.isAuthenticated || !client.userId) {
      this.sendError(client, 'Not authenticated');
      return;
    }

    const { orderId, message } = data;
    const userId = client.userId;

    this.logger.log(`💬 User ${userId} sending message to order ${orderId}`);

    try {
      // Atomically verify user is still a participant
      const participantCheck = await this.chatRedisService.atomicParticipantCheck(orderId, userId);
      
      if (!participantCheck.isParticipant) {
        this.sendError(client, 'Not authorized for this order');
        return;
      }

      // Validate message
      if (!message || message.trim().length === 0) {
        this.sendError(client, 'Message cannot be empty');
        return;
      }

      if (message.length > 1000) {
        this.sendError(client, 'Message too long');
        return;
      }

      const timestamp = Date.now();

      // Generate anonymous username for this user
      const anonymousUsername = this.chatService.generateAnonymousUsername(userId, orderId);

      // Store message in Redis Streams
      const messageId = await this.chatService.storeChatMessage(
        orderId,
        userId,
        anonymousUsername,
        message.trim(),
      );

      // Prepare message for broadcasting
      const broadcastMessage = {
        type: 'new_message',
        messageId: messageId,
        orderId: orderId,
        username: anonymousUsername,
        message: message.trim(),
        timestamp: timestamp,
      };

      // Broadcast to online participants in room
      this.broadcastToRoom(orderId, broadcastMessage, client);

      // Send confirmation to sender
      client.send(JSON.stringify({
        type: 'message_sent',
        messageId: messageId,
        orderId: orderId,
      }));

      // Send FCM to offline participants
      await this.notifyOfflineParticipants(orderId, anonymousUsername, message.trim());

      this.logger.log(`✅ Message ${messageId} sent successfully to order ${orderId}`);

    } catch (error) {
      this.logger.error(`❌ Error sending message: ${error.message}`);
      this.sendError(client, 'Failed to send message');
    }
  }

  @SubscribeMessage('leave_order')
  async handleLeaveOrder(
    @ConnectedSocket() client: AuthenticatedWebSocket,
    @MessageBody() data: { orderId: string },
  ) {
    if (!client.isAuthenticated || !client.userId) {
      return;
    }

    const { orderId } = data;
    const userId = client.userId;

    const room = this.orderRooms.get(orderId);
    if (room && room.has(client)) {
      room.delete(client);
      this.logger.log(`📤 User ${userId} left order room ${orderId}`);

      // Clean up empty rooms
      if (room.size === 0) {
        this.orderRooms.delete(orderId);
        this.logger.log(`🗑️ Removed empty order room ${orderId}`);
      }

      client.send(JSON.stringify({
        type: 'leave_success',
        orderId: orderId,
      }));
    }
  }

  @SubscribeMessage('get_messages')
  async handleGetMessages(
    @ConnectedSocket() client: AuthenticatedWebSocket,
    @MessageBody() data: {
      orderId: string;
      before?: string;
      after?: string;
      count?: number;
    },
  ) {
    if (!client.isAuthenticated || !client.userId) {
      this.sendError(client, 'Not authenticated');
      return;
    }

    const { orderId, before, after, count = 50 } = data;
    const userId = client.userId;

    this.logger.log(`📖 User ${userId} requesting messages for order ${orderId}`);

    try {
      // Atomically verify user is still a participant
      const participantCheck = await this.chatRedisService.atomicParticipantCheck(orderId, userId);
      
      if (!participantCheck.isParticipant) {
        this.sendError(client, 'Not authorized for this order');
        return;
      }

      // Get paginated messages
      const direction = before ? 'older' : after ? 'newer' : 'older';
      const chatHistoryResult = await this.chatService.getChatHistory(orderId, {
        count,
        before,
        after,
        direction
      });

      // Send response
      client.send(JSON.stringify({
        type: 'messages_response',
        orderId,
        messages: chatHistoryResult.messages,
        hasMore: chatHistoryResult.hasMore,
        oldestMessageId: chatHistoryResult.oldestMessageId,
        newestMessageId: chatHistoryResult.newestMessageId,
        requestType: direction,
      }));

      this.logger.log(`📖 Sent ${chatHistoryResult.messages.length} ${direction} messages to user ${userId} for order ${orderId}`);

    } catch (error) {
      this.logger.error(`❌ Error getting messages: ${error.message}`);
      this.sendError(client, 'Failed to get messages');
    }
  }

  private sendError(client: WebSocket, message: string) {
    client.send(JSON.stringify({
      type: 'error',
      message: message,
    }));
  }

  private broadcastToRoom(orderId: string, message: any, excludeClient?: WebSocket) {
    const room = this.orderRooms.get(orderId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    
    for (const client of room) {
      if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    }
  }

  // Utility method to get connected user IDs for an order (for FCM targeting)
  getConnectedUsersForOrder(orderId: string): string[] {
    const room = this.orderRooms.get(orderId);
    if (!room) return [];

    const connectedUserIds: string[] = [];
    for (const client of room) {
      const userId = this.connectedClients.get(client);
      if (userId) {
        connectedUserIds.push(userId);
      }
    }
    
    return connectedUserIds;
  }

    /**
   * Send FCM notifications to offline participants
   */
  private async notifyOfflineParticipants(
    orderId: string,
    senderUsername: string,
    message: string,
  ): Promise<void> {
    try {
      // Get all participants for this order using the new service
      const allParticipants = await this.chatRedisService.getOrderParticipants(orderId);
      
      if (!allParticipants || allParticipants.length === 0) {
        this.logger.log(`📤 No participants found for order ${orderId}`);
        return;
      }

      // Get currently connected users
      const connectedUsers = this.getConnectedUsersForOrder(orderId);
      
      // Find offline participants
      const offlineParticipants = allParticipants.filter(
        userId => !connectedUsers.includes(userId)
      );

      if (offlineParticipants.length === 0) {
        this.logger.log(`📤 All participants for order ${orderId} are online`);
        return;
      }

      this.logger.log(
        `📤 Sending FCM to ${offlineParticipants.length} offline participants for order ${orderId}`
      );

      // Get FCM tokens for offline users and send notifications
      for (const userId of offlineParticipants) {
        try {
          const user = await this.userRepository.findOne({ 
            where: { id: userId } 
          });

          if (!user || !user.fcmToken) {
            this.logger.log(`📤 No FCM token found for user ${userId}`);
            continue;
          }

          const truncatedMessage = message.length > 100 ? 
            `${message.substring(0, 100)}...` : message;

          const notificationTitle = 'New message in your order';
          const notificationBody = `${senderUsername}: ${truncatedMessage}`;
          const notificationData = {
            type: 'chat_message',
            orderId: orderId,
            senderUsername: senderUsername,
            messagePreview: truncatedMessage,
            deeplink: `bundl://chat/${orderId}`,
          };

          await this.fcmService.sendPushNotification(
            user.fcmToken,
            notificationTitle,
            notificationBody,
            notificationData
          );

          this.logger.log(`📲 Sent FCM notification to user ${userId} for order ${orderId}`);

        } catch (userError) {
          this.logger.error(`❌ Failed to send FCM to user ${userId}: ${userError.message}`);
        }
      }

    } catch (error) {
      this.logger.error(`❌ Failed to notify offline participants: ${error.message}`);
    }
  }
}
