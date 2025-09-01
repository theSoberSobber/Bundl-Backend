import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { EventsService } from '../services/events.service';
import { FcmService } from '../services/fcm/fcm.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]), // Only User entity needed for events
  ],
  providers: [EventsService, FcmService],
  exports: [EventsService, FcmService],
})
export class SharedModule {}
