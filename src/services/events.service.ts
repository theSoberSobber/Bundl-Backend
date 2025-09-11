import { Injectable } from '@nestjs/common';
import { Order } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FcmService } from './fcm/fcm.service';
import { ChatEventsService } from '../chat/chat-events.service';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly fcmService: FcmService,
    private readonly chatEventsService: ChatEventsService,
  ) {}

  // Handle successful pledge event
  async handleSuccessfulPledge(order: Order, userId: string): Promise<void> {
    // Send chat notification for user joining order
    try {
      await this.chatEventsService.onUserJoinedOrder(order.id, userId);
    } catch (error) {
      console.warn(`Failed to send chat notification for user joining order ${order.id}: ${error.message}`);
    }

    // Get all users involved in the order except the current user
    const userIds = Object.keys(order.pledgeMap).filter((id) => id !== userId);

    if (userIds.length === 0) {
      return;
    }

    // Get all users with FCM tokens
    const users = await this.userRepository.find({
      where: userIds.map((id) => ({ id })),
    });

    // Send notifications to users with FCM tokens
    for (const user of users) {
      if (user.fcmToken) {
        await this.sendPushNotification(
          user.fcmToken,
          'New Pledge',
          `A new user has pledged to an order you're part of!`,
          {
            orderId: order.id,
            eventType: 'new_pledge',
          },
        );
      }
    }
  }

  // Handle order completed event
  async handleOrderCompleted(order: Order): Promise<void> {
    const userIds = Object.keys(order.pledgeMap);

    if (userIds.length === 0) {
      return;
    }

    // Get all users with FCM tokens
    const users = await this.userRepository.find({
      where: userIds.map((id) => ({ id })),
    });

    // Send notifications to all pledgers
    for (const user of users) {
      if (user.fcmToken) {
        await this.sendPushNotification(
          user.fcmToken,
          'Order Completed',
          `An order you pledged to has been completed!`,
          {
            orderId: order.id,
            eventType: 'order_completed',
          },
        );
      }
    }
  }

  // Handle order expired event
  async handleOrderExpired(order: Order): Promise<void> {
    // Send chat notification for order expiry
    try {
      await this.chatEventsService.onOrderExpired(order.id, 'Order expired');
    } catch (error) {
      console.warn(`Failed to send chat notification for expired order ${order.id}: ${error.message}`);
    }

    const userIds = Object.keys(order.pledgeMap);

    if (userIds.length === 0) {
      return;
    }

    // Get all users with FCM tokens
    const users = await this.userRepository.find({
      where: userIds.map((id) => ({ id })),
    });

    // Send notifications to all pledgers
    for (const user of users) {
      if (user.fcmToken) {
        await this.sendPushNotification(
          user.fcmToken,
          'Order Expired',
          `An order you pledged to has expired. Your credit has been refunded.`,
          {
            orderId: order.id,
            eventType: 'order_expired',
            platform: order.platform,
            amountNeeded: order.amountNeeded.toString(),
            yourPledge: (order.pledgeMap[user.id] || 0).toString(),
            creditRefunded: 'true',
          },
        );
      }
    }
  }

  // Handle pledge failure event
  async handlePledgeFailure(userId: string, reason: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.fcmToken) {
      return;
    }

    await this.sendPushNotification(
      user.fcmToken,
      'Pledge Failed',
      `Your pledge was not successful: ${reason}`,
      {
        eventType: 'pledge_failed',
        reason,
      },
    );
  }

  // Handle chat message FCM notifications (pure side effects)
  async handleChatMessage(
    offlineParticipantIds: string[], 
    messageData: {
      orderId: string;
      message: string;
      senderName: string;
      messageType: string;
    }
  ): Promise<void> {
    if (offlineParticipantIds.length === 0) {
      return;
    }

    // Get users with FCM tokens
    const users = await this.userRepository.find({
      where: offlineParticipantIds.map((id) => ({ id })),
    });

    // Send notifications to users with FCM tokens
    for (const user of users) {
      if (user.fcmToken) {
        await this.sendPushNotification(
          user.fcmToken,
          `New message from ${messageData.senderName}`,
          messageData.message,
          {
            orderId: messageData.orderId,
            eventType: messageData.messageType,
          },
        );
      }
    }
  }

  // Send push notification using FCM
  private async sendPushNotification(
    fcmToken: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    // Use FcmService to send the notification
    await this.fcmService.sendPushNotification(fcmToken, title, body, data);
  }
}
