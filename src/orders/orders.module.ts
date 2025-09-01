import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRedisService } from './services/orders-redis.service';
import { Order } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, User]),
    EventEmitterModule,
    AuthModule,
    CreditsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRedisService],
  exports: [OrdersService],
})
export class OrdersModule {}
