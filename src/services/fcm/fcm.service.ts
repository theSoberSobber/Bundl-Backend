import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);

  constructor() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      if (admin.apps.length) {
        this.logger.log('Firebase Admin SDK already initialized');
        return;
      }

      const serviceFilePath = process.env.FCM_SERVICE_FILE_PATH;
      if (!serviceFilePath) {
        this.logger.warn('FCM_SERVICE_FILE_PATH is not defined in environment variables, FCM functionality will be disabled');
        return;
      }

      const absolutePath = path.resolve(process.cwd(), serviceFilePath);
      if (!fs.existsSync(absolutePath)) {
        this.logger.warn(`FCM service account file not found at path: ${absolutePath}, FCM functionality will be disabled`);
        return;
      }

      const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Firebase: ${error.message}`);
    }
  }

  async sendPushNotification(token: string, title: string, body: string, data: Record<string, string> = {}): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // If FCM is not initialized or token is not provided, log and return
    if (!admin.apps.length || !token) {
      this.logger.warn(`FCM not initialized or token not provided (${token}), skipping notification`);
      
      // Still log the notification content
      this.logger.log(`[NOTIFICATION] To: ${token}, Title: ${title}, Body: ${body}, Data: ${JSON.stringify(data)}`);
      
      return { success: false, error: 'FCM not initialized or token not provided' };
    }

    const message: admin.messaging.TokenMessage = {
      token,
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'high',
      },
    };

    return this.sendMessage(message);
  }

  private async sendMessage(message: admin.messaging.Message): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Create a safe log object that doesn't expose the token
      const logObject = {
        hasToken: Boolean(('token' in message) && message.token),
        notification: message.notification,
        dataKeys: message.data ? Object.keys(message.data) : []
      };
      
      this.logger.log(`[sendMessage] Attempting to send message: ${JSON.stringify(logObject)}`);
      
      const response = await admin.messaging().send(message);
      this.logger.log(`FCM message sent successfully: ${response}`);
      return { success: true, messageId: response };
    } catch (error) {
      this.logger.error(`Error sending FCM message: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }
} 