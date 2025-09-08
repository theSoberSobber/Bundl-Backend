import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditsController } from './credits.controller';
import { User } from '../entities/user.entity';
import { CreditPurchase } from '../entities/credit-purchase.entity';
import { CreditsService } from './credits.service';
import { RevenueCatService } from './services/revenuecat.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, CreditPurchase]), 
    AuthModule
  ],
  controllers: [CreditsController],
  providers: [CreditsService, RevenueCatService],
  exports: [CreditsService, RevenueCatService],
})
export class CreditsModule {}
