import { Test, TestingModule } from '@nestjs/testing';
import { CreditsController } from './credits.controller';
import { CashfreeService } from './services/cashfree.service';
import { CreditsService } from './credits.service';

// Mock services
const mockCashfreeService = {
  createOrder: jest.fn(),
  verifyWebhook: jest.fn(),
  calculatePrice: jest.fn(),
};

const mockCreditsService = {
  getCredits: jest.fn(),
};

describe('CreditsController', () => {
  let controller: CreditsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditsController],
      providers: [
        {
          provide: CashfreeService,
          useValue: mockCashfreeService,
        },
        {
          provide: CreditsService,
          useValue: mockCreditsService,
        },
      ],
    }).compile();

    controller = module.get<CreditsController>(CreditsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
