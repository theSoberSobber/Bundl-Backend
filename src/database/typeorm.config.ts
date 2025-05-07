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
  host: configService.get('DB_HOST'),
  port: configService.get('DB_PORT'),
  username: configService.get('DB_USERNAME'),
  password: configService.get('DB_PASSWORD'),
  database: configService.get('DB_DATABASE'),
  entities: [User, Order],
  migrations: [CreateUserAndOrderTables1683500000000],
  migrationsTableName: 'migrations',
  synchronize: false,
}); 