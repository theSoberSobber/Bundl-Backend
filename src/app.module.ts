import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { User } from './entities/user.entity';
import { Order } from './entities/order.entity';
import { OrdersModule } from './orders/orders.module';
import { SharedModule } from './shared/shared.module';
import { CreditsModule } from './credits/credits.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: +configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [User, Order],
        synchronize: false,
      }),
    }),
    EventEmitterModule.forRoot(),
    RedisModule,
    AuthModule,
    OrdersModule,
    SharedModule,
    CreditsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  onModuleInit() {
    try {
      // Get all environment variables
      const envVars = {
        // Server
        PORT: this.configService.getOrThrow('PORT'),
        
        // Database
        DB_HOST: this.configService.getOrThrow('DB_HOST'),
        DB_PORT: this.configService.getOrThrow('DB_PORT'),
        DB_USERNAME: this.configService.getOrThrow('DB_USERNAME'),
        DB_PASSWORD: this.configService.getOrThrow('DB_PASSWORD'),
        DB_DATABASE: this.configService.getOrThrow('DB_DATABASE'),
        
        // Redis
        REDIS_HOST: this.configService.getOrThrow('REDIS_HOST'),
        REDIS_PORT: this.configService.getOrThrow('REDIS_PORT'),
        REDIS_PREFIX: this.configService.getOrThrow('REDIS_PREFIX'),
        
        // JWT
        JWT_SECRET: this.configService.getOrThrow('JWT_SECRET'),
        REFRESH_TOKEN_SECRET: this.configService.getOrThrow('REFRESH_TOKEN_SECRET'),
        JWT_EXPIRES_IN: this.configService.getOrThrow('JWT_EXPIRES_IN'),
        
        // FCM
        FCM_SERVICE_FILE_PATH: this.configService.getOrThrow('FCM_SERVICE_FILE_PATH'),
        
        // Orvio
        ORVIO_API_URL: this.configService.getOrThrow('ORVIO_API_URL'),
        ORVIO_API_KEY: this.configService.getOrThrow('ORVIO_API_KEY'),
        ORVIO_ORG_NAME: this.configService.getOrThrow('ORVIO_ORG_NAME'),
        
        // Debug
        DEBUG_ENABLED: this.configService.getOrThrow('DEBUG_ENABLED'),
        
        // Cashfree
        CASHFREE_CLIENT_ID: this.configService.getOrThrow('CASHFREE_CLIENT_ID'),
        CASHFREE_CLIENT_SECRET: this.configService.getOrThrow('CASHFREE_CLIENT_SECRET'),
        CASHFREE_ENVIRONMENT: this.configService.getOrThrow('CASHFREE_ENVIRONMENT'),
        APP_URL: this.configService.getOrThrow('APP_URL'),
        
        // Firebase
        FIREBASE_SERVICE_ACCOUNT_PATH: this.configService.getOrThrow('FIREBASE_SERVICE_ACCOUNT_PATH'),
      };
      
      console.log('Environment Variables:');
      console.log(JSON.stringify(envVars, null, 2));
    } catch (error) {
      console.error('Missing required environment variable:', error.message);
      console.error('Application cannot start without all required environment variables');
      process.exit(1);
    }
  }
}
