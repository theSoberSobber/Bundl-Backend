import { Injectable, Logger } from '@nestjs/common';
import { GeohashUtils } from '../utils/geohash.util';
import { FcmService } from './fcm/fcm.service';

/**
 * GeohashLocationService - Manages location-based geohash notifications
 * 
 * This service calculates geohashes for order locations and publishes
 * FCM notifications to relevant geohash topics for nearby users.
 * 
 * Configuration matches mobile app exactly:
 * - Precision 7: ~153m accuracy (perfect for 200m radius)
 * - Radius: 200m around order location
 * - Topics: geohash_[hash] format
 */
@Injectable()
export class GeohashLocationService {
  private readonly logger = new Logger(GeohashLocationService.name);

  // Configuration constants matching mobile app exactly
  private readonly GEOHASH_PRECISION_LEVELS = [7]; // ~153m accuracy (perfect for 200m radius)
  private readonly MAX_RADIUS_METERS = 200.0; // 200m maximum notification radius

  constructor(private readonly fcmService: FcmService) {}

  /**
   * Calculate geohashes for an order location and send notifications
   */
  async notifyNearbyUsers(
    latitude: number,
    longitude: number,
    orderId: string,
    platform: string,
    amountNeeded: number,
    notificationType: 'order_created' | 'pledge_update' | 'order_completed' = 'order_created',
    additionalData: Record<string, string> = {},
  ): Promise<{
    totalTopics: number;
    successful: number;
    failed: number;
    geohashes: string[];
  }> {
    try {
      // Calculate geohashes covering the order location
      const geohashes = this.calculateGeohashesForLocation(
        latitude,
        longitude,
        this.MAX_RADIUS_METERS,
      );

      this.logger.log(
        `Calculated ${geohashes.size} geohashes for order ${orderId} at location: ${latitude}, ${longitude}`,
      );
      this.logger.debug(`Geohashes: ${Array.from(geohashes).join(', ')}`);

      // Create FCM topics with geohash_ prefix (matching mobile app)
      const topics = Array.from(geohashes).map(hash => `geohash_${hash}`);

      // Create notification content based on type
      const { title, body } = this.getNotificationContent(
        notificationType,
        platform,
        amountNeeded,
        additionalData,
      );

      // Send notification to all relevant topics
      const result = await this.fcmService.sendMultiTopicNotification(
        topics,
        title,
        body,
        {
          orderId,
          platform,
          amountNeeded: amountNeeded.toString(),
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          type: notificationType,
          ...additionalData,
        },
      );

      this.logger.log(
        `Order ${orderId} ${notificationType} notification sent to ${result.totalTopics} geohash topics: ${result.successful} successful, ${result.failed} failed`,
      );

      return {
        totalTopics: result.totalTopics,
        successful: result.successful,
        failed: result.failed,
        geohashes: Array.from(geohashes),
      };
    } catch (error) {
      this.logger.error(
        `Error notifying nearby users for order ${orderId}:`,
        error.stack,
      );
      return {
        totalTopics: 0,
        successful: 0,
        failed: 0,
        geohashes: [],
      };
    }
  }

  /**
   * Get notification content based on type
   */
  private getNotificationContent(
    type: 'order_created' | 'pledge_update' | 'order_completed',
    platform: string,
    amountNeeded: number,
    additionalData: Record<string, string>,
  ): { title: string; body: string } {
    switch (type) {
      case 'order_created':
        return {
          title: 'New Order Nearby! 📦',
          body: `${platform} delivery needed • ₹${amountNeeded} required`,
        };
      
      case 'pledge_update':
        const pledgePercentage = additionalData.pledgePercentage || '0';
        return {
          title: 'Order Progress Update 📈',
          body: `${platform} order ${pledgePercentage}% funded • ₹${amountNeeded} target`,
        };
      
      case 'order_completed':
        return {
          title: 'Order Completed! ✅',
          body: `${platform} order fully funded • Ready for delivery!`,
        };
      
      default:
        return {
          title: 'Order Update',
          body: `${platform} • ₹${amountNeeded}`,
        };
    }
  }

  /**
   * Calculate geohashes covering a circular area around the given location
   */
  private calculateGeohashesForLocation(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Set<string> {
    const allGeohashes = new Set<string>();

    // For each precision level, calculate coverage
    for (const precision of this.GEOHASH_PRECISION_LEVELS) {
      const precisionGeohashes = GeohashUtils.getCoverageGeohashes(
        latitude,
        longitude,
        radiusMeters,
        precision,
      );
      
      // Add all geohashes from this precision level
      precisionGeohashes.forEach(hash => allGeohashes.add(hash));
    }

    return allGeohashes;
  }

  /**
   * Get geohashes for a specific location (for debugging/testing)
   */
  getGeohashesForLocation(
    latitude: number,
    longitude: number,
    radiusMeters: number = this.MAX_RADIUS_METERS,
  ): string[] {
    const geohashes = this.calculateGeohashesForLocation(
      latitude,
      longitude,
      radiusMeters,
    );
    return Array.from(geohashes);
  }

  /**
   * Calculate distance between two points (utility method)
   */
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return GeohashUtils.distanceMeters(lat1, lon1, lat2, lon2);
  }
}
