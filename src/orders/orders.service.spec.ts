import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { OrdersRedisService } from './services/orders-redis.service';
import { CreditsService } from '../credits/credits.service';
import { EventsService } from '../services/events.service';

// Mock all dependencies
const mockOrderRepository = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
};

const mockUserRepository = {
  findOne: jest.fn(),
};

const mockOrdersRedisService = {
  storeOrder: jest.fn(),
  pledgeToOrder: jest.fn(),
  findOrdersNear: jest.fn(),
  getOrder: jest.fn(),
  deleteOrder: jest.fn(),
};

const mockCreditsService = {
  useCredits: jest.fn(),
  addCredits: jest.fn(),
};

const mockEventsService = {
  handleSuccessfulPledge: jest.fn(),
  handleOrderCompletion: jest.fn(),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(Order),
          useValue: mockOrderRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: OrdersRedisService,
          useValue: mockOrdersRedisService,
        },
        {
          provide: CreditsService,
          useValue: mockCreditsService,
        },
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
