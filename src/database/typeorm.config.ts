import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { User } from '../entities/user.entity';
import { Order } from '../entities/order.entity';
import { CreateUserAndOrderTables1683500000000 } from '../migrations/1683500000000-CreateUserAndOrderTables';

// Load .env file
config();

const configService = new ConfigService();

export default new DataSource({
  type: 'postgres',
  host: configService.get('DB_HOST', 'localhost'),
  port: configService.get('DB_PORT', 5432),
  username: configService.get('DB_USERNAME', 'postgres'),
  password: configService.get('DB_PASSWORD', 'postgres'),
  database: configService.get('DB_DATABASE', 'bundl'),
  entities: [User, Order],
  migrations: [CreateUserAndOrderTables1683500000000],
  migrationsTableName: 'migrations',
  synchronize: false,
}); 