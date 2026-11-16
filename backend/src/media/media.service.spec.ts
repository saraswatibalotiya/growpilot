import { NotFoundException, PayloadTooLargeException, UnsupportedMediaTypeException, BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';

const OWNER_BUSINESS = { id: 'biz-1' };
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);

function build(overrides: { primary?: unknown } = {}) {
  const businesses = { getProfile: jest.fn().mockResolvedValue(OWNER_BUSINESS) };
  const businessRepository = { findPrimaryForUser: jest.fn().mockResolvedValue(overrides.primary ?? OWNER_BUSINESS) };
  const repository = {
    create: jest.fn(async (id: string, data: Record<string, unknown>) => ({ id, ...data })),
    findById: jest.fn(),
    findByHash: jest.fn().mockResolvedValue(null),
  };
  const cloudinary = {
    upload: jest.fn().mockResolvedValue({ publicId: 'growpilot/biz-1/abc', secureUrl: 'https://res.cloudinary.com/x/abc.jpg', width: 800, height: 1000, bytes: 104 }),
  };
  const service = new MediaService(businesses as never, businessRepository as never, repository as never, cloudinary as never);
  return { service, repository, cloudinary };
}

describe('MediaService.upload', () => {
  it('stores a valid JPEG in the owner business folder and records metadata', async () => {
    const { service, repository, cloudinary } = build();
    const asset = await service.upload('user-1', { buffer: JPEG, size: JPEG.length });
    expect(cloudinary.upload).toHaveBeenCalledWith(JPEG, 'image/jpeg', 'growpilot/biz-1', 'product.jpg');
    expect(repository.create).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ businessId: 'biz-1', mimeType: 'image/jpeg', sha256: expect.any(String) }));
    expect(asset).toMatchObject({ secureUrl: 'https://res.cloudinary.com/x/abc.jpg' });
  });

  it('returns the earlier upload for the same picture instead of storing it again', async () => {
    const { service, repository, cloudinary } = build();
    repository.findByHash.mockResolvedValueOnce({ id: 'old', secureUrl: 'https://res.cloudinary.com/x/old.jpg' });
    const asset = await service.upload('user-1', { buffer: JPEG, size: JPEG.length });
    expect(asset).toMatchObject({ id: 'old' });
    expect(cloudinary.upload).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a missing or empty file', async () => {
    const { service } = build();
    await expect(service.upload('user-1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload('user-1', { buffer: Buffer.alloc(0), size: 0 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects files over 10 MB before reading them', async () => {
    const { service, cloudinary } = build();
    await expect(service.upload('user-1', { buffer: JPEG, size: 11 * 1024 * 1024 })).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(cloudinary.upload).not.toHaveBeenCalled();
  });

  it('rejects a non-image disguised as an image', async () => {
    const { service, cloudinary } = build();
    const fake = Buffer.from('<script>alert(1)</script>');
    await expect(service.upload('user-1', { buffer: fake, size: fake.length })).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(cloudinary.upload).not.toHaveBeenCalled();
  });
});

describe('MediaService.get', () => {
  it("returns an asset only to the owner of its business", async () => {
    const { service, repository } = build();
    repository.findById.mockResolvedValue({ id: 'm1', businessId: 'biz-1' });
    await expect(service.get('user-1', 'm1')).resolves.toMatchObject({ id: 'm1' });
  });

  it("answers 404 for another owner's asset, same as a missing one", async () => {
    const { service, repository } = build({ primary: { id: 'biz-2' } });
    repository.findById.mockResolvedValue({ id: 'm1', businessId: 'biz-1' });
    await expect(service.get('user-2', 'm1')).rejects.toBeInstanceOf(NotFoundException);
    repository.findById.mockResolvedValue(null);
    await expect(service.get('user-2', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
