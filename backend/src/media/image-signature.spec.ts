import { detectImage } from './image-signature';

describe('detectImage', () => {
  it('detects JPEG, PNG and WEBP by their leading bytes', () => {
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.mimeType).toBe('image/jpeg');
    expect(detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mimeType).toBe('image/png');
    expect(detectImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))?.mimeType).toBe('image/webp');
  });

  it('detects HEIC from the ftyp brand', () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic', 'ascii'), Buffer.alloc(8)]);
    expect(detectImage(heic)?.mimeType).toBe('image/heic');
  });

  it('rejects a text file renamed to .jpg, and an MP4 video', () => {
    expect(detectImage(Buffer.from('<html>not an image</html>'))).toBeNull();
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom', 'ascii'), Buffer.alloc(8)]);
    expect(detectImage(mp4)).toBeNull();
  });
});
