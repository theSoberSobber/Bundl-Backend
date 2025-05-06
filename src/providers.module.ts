import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Order } from './entities/order.entity';
import { CreditsService, EventsService } from './services';
import { FcmService } from './services/fcm/fcm.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Order]),
  ],
  providers: [CreditsService, EventsService, FcmService],
  exports: [CreditsService, EventsService, FcmService],
})
export class ProvidersModule {} 