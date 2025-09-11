export interface ChatMessage {
  id: string;
  orderId: string;
  senderId: string;
  senderName?: string;
  message: string;
  timestamp: Date;
  type: 'user' | 'system';
  systemType?: 'user_joined' | 'user_left' | 'order_update' | 'order_completed' | 'payment_update';
  metadata?: Record<string, any>;
}

export interface SendMessageDto {
  orderId: string;
  userId: string;
  message: string;
  type?: 'USER_MESSAGE' | 'SYSTEM_MESSAGE' | 'ORDER_UPDATE';
  metadata?: Record<string, any>;
}

export interface JoinChatDto {
  orderId: string;
  lastSeenId?: string;
}

export interface SendChatMessageDto {
  orderId: string;
  message: string;
}
