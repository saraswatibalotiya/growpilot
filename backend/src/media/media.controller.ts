import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiBody, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MAX_UPLOAD_BYTES } from './media.service';
import { MediaService } from './media.service';

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @ApiOperation({ summary: 'Upload a product photo (JPEG, PNG, WEBP or HEIC, max 10 MB) to the owner\'s business' })
  @ApiCreatedResponse({ description: 'Stored asset metadata; the file is held in Cloudinary' })
  upload(@Req() req: AuthenticatedRequest, @UploadedFile() file: { buffer: Buffer; size: number; originalname?: string } | undefined) {
    return this.media.upload(req.userId, file);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Metadata for one uploaded photo (owner only)' })
  @ApiOkResponse({ description: 'Asset metadata' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  get(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.get(req.userId, id);
  }
}
