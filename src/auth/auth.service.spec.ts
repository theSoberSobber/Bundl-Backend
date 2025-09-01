import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { OrvioService } from './services/orvio.service';
import { OtpRedisService } from './services/otp-redis.service';
import { ConfigService } from '@nestjs/config';

// Mock all dependencies
const mockUserRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn(),
  verify: jest.fn(),
};

const mockOrvioService = {
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
};

const mockOtpRedisService = {
  storePhoneNumber: jest.fn(),
  getPhoneNumber: jest.fn(),
  deletePhoneNumber: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

const mockRedis = {
  sadd: jest.fn(),
  setex: jest.fn(),
  exists: jest.fn(),
  smembers: jest.fn(),
  ttl: jest.fn(),
  del: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: OrvioService,
          useValue: mockOrvioService,
        },
        {
          provide: OtpRedisService,
          useValue: mockOtpRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
