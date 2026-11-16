import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessProfileResponse, CreateBusinessProfileDto, UpdateBusinessProfileDto } from './business.dto';
import { BusinessService } from './business.service';

@ApiTags('Business')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('business/profile')
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get()
  @ApiOperation({ summary: "Get the signed-in owner's business profile" })
  @ApiOkResponse({ type: BusinessProfileResponse })
  @ApiNotFoundResponse({ description: 'No profile yet' })
  get(@Req() req: AuthenticatedRequest) {
    return this.business.getProfile(req.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create the business profile (once per owner)' })
  @ApiCreatedResponse({ type: BusinessProfileResponse })
  @ApiConflictResponse({ description: 'A profile already exists; use PATCH' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateBusinessProfileDto) {
    return this.business.createProfile(req.userId, dto);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the business profile; only the fields you send change' })
  @ApiOkResponse({ type: BusinessProfileResponse })
  @ApiNotFoundResponse({ description: 'No profile yet' })
  update(@Req() req: AuthenticatedRequest, @Body() dto: UpdateBusinessProfileDto) {
    return this.business.updateProfile(req.userId, dto);
  }
}
