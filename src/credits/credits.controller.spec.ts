import { Test, TestingModule } from '@nestjs/testing';
import { CreditsController } from './credits.controller';
import { RevenueCatService } from './services/revenuecat.service';
import { CreditsService } from './credits.service';
import { ConfigService } from '@nestjs/config';

// Mock services
const mockRevenueCatService = {
  getCreditPackages: jest.fn(),
  calculatePrice: jest.fn(),
  verifyWebhookAuthorization: jest.fn(),
  processWebhookEvent: jest.fn(),
  getUserPurchaseHistory: jest.fn(),
  isConfigured: jest.fn(),
};

const mockCreditsService = {
  getCredits: jest.fn(),
  findUserById: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

describe('CreditsController', () => {
  let controller: CreditsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditsController],
      providers: [
        {
          provide: RevenueCatService,
          useValue: mockRevenueCatService,
        },
        {
          provide: CreditsService,
          useValue: mockCreditsService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<CreditsController>(CreditsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
