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

  describe('isDummyTestAccount', () => {
    it('should return true for phone numbers with exactly 10 nines', () => {
      // Access private method for testing using bracket notation
      expect(service['isDummyTestAccount']('9999999999')).toBe(true);
    });

    it('should return true for phone numbers with country code and 10 nines', () => {
      expect(service['isDummyTestAccount']('+919999999999')).toBe(true);
      expect(service['isDummyTestAccount']('919999999999')).toBe(true);
      expect(service['isDummyTestAccount']('0919999999999')).toBe(true);
      expect(service['isDummyTestAccount']('+910919999999999')).toBe(false); // too long
    });

    it('should return true for phone numbers with formatting and 10 nines', () => {
      expect(service['isDummyTestAccount']('+91-9999-999-999')).toBe(true);
      expect(service['isDummyTestAccount']('+91 9999 999 999')).toBe(true);
      expect(service['isDummyTestAccount']('91 9999999999')).toBe(true);
    });

    it('should return false for phone numbers with less than 10 nines', () => {
      expect(service['isDummyTestAccount']('999999999')).toBe(false); // 9 nines
      expect(service['isDummyTestAccount']('+91999999999')).toBe(false); // 9 nines
      expect(service['isDummyTestAccount']('91999999999')).toBe(false); // 9 nines
    });

    it('should return false for phone numbers with more than 10 nines', () => {
      expect(service['isDummyTestAccount']('99999999999')).toBe(false); // 11 nines
      expect(service['isDummyTestAccount']('+9199999999999')).toBe(false); // 11 nines with country code
      expect(service['isDummyTestAccount']('9199999999999')).toBe(false); // 11 nines with country code
    });

    it('should return false for regular phone numbers', () => {
      expect(service['isDummyTestAccount']('9876543210')).toBe(false);
      expect(service['isDummyTestAccount']('+919876543210')).toBe(false);
      expect(service['isDummyTestAccount']('9123456789')).toBe(false);
    });

    it('should return false for phone numbers with mixed digits containing 9s', () => {
      expect(service['isDummyTestAccount']('9999999998')).toBe(false);
      expect(service['isDummyTestAccount']('8999999999')).toBe(false);
      expect(service['isDummyTestAccount']('9899999999')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(service['isDummyTestAccount']('')).toBe(false);
      expect(service['isDummyTestAccount']('abc')).toBe(false);
      expect(service['isDummyTestAccount']('+91')).toBe(false);
      expect(service['isDummyTestAccount']('9')).toBe(false);
    });
  });
});
