import { Injectable } from '@nestjs/common';
import { Order } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FcmService } from './fcm/fcm.service';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly fcmService: FcmService,
  ) {}

  // Handle successful pledge event
  async handleSuccessfulPledge(order: Order, userId: string): Promise<void> {
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
