import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { EventsService } from '../services/events.service';
import { FcmService } from '../services/fcm/fcm.service';
import { GeohashLocationService } from '../services/geohash-location.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]), // Only User entity needed for events
    ChatModule,
  ],
  providers: [EventsService, FcmService, GeohashLocationService],
  exports: [EventsService, FcmService, GeohashLocationService],
})
export class SharedModule {}
