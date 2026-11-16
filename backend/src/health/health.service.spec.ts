import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  const checkConnection = jest.fn<Promise<void>, []>();

  beforeEach(async () => {
    checkConnection.mockReset();
    checkConnection.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: { checkConnection },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('reports a healthy database after a successful query', async () => {
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      app: 'GrowPilot',
      database: 'connected',
      timestamp: expect.any(String),
    });
    expect(checkConnection).toHaveBeenCalledTimes(1);
  });

  it('propagates database connection failures', async () => {
    const error = new Error('Database unavailable');
    checkConnection.mockRejectedValue(error);

    await expect(service.check()).rejects.toBe(error);
  });
});
