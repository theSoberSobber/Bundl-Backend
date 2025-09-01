import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditsController } from './credits.controller';
import { User } from '../entities/user.entity';
import { CreditsService } from './credits.service';
import { CashfreeService } from './services/cashfree.service';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AuthModule,
    RedisModule,
  ],
  controllers: [CreditsController],
  providers: [CreditsService, CashfreeService],
  exports: [CreditsService, CashfreeService],
})
export class CreditsModule {}
