import { Module } from '@nestjs/common';
import { RedisService } from './redis/redis.service';
import { RedisModule as IoRedisModule } from '@nestjs-modules/ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    IoRedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        url: `redis://${configService.get('REDIS_HOST', 'localhost')}:${configService.get('REDIS_PORT', 6379)}`,
        options: {
          keyPrefix: configService.get('REDIS_PREFIX', 'bundl:'),
          enableAutoPipelining: true,
          commandTimeout: 5000,
          db: 0,
          retryStrategy: (times) => Math.min(times * 50, 2000),
          // Configure redis to notify expiry events
          notify_keyspace_events: 'Ex',
        },
      }),
    }),
    EventEmitterModule.forRoot(),
  ],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
