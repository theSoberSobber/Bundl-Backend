import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatEventsService } from './chat-events.service';
import { OrdersRedisService } from '../orders/services/orders-redis.service';
import { RedisModule } from '../redis/redis.module';
import { FcmService } from '../services/fcm/fcm.service';
import { User } from '../entities/user.entity';
import { EventsService } from '../services/events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    RedisModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fallback-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [
    ChatGateway,
    ChatService,
    ChatEventsService,
    OrdersRedisService,
    FcmService,
    EventsService,
  ],
  exports: [
    ChatService,
    ChatEventsService,
    ChatGateway,
  ],
})
export class ChatModule {}
