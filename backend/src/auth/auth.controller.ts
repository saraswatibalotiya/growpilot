import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a user and initial business; issue access and refresh tokens' })
  @ApiCreatedResponse({ description: 'Safe user/business details, access token and refresh token; no password hash' })
  @ApiBadRequestResponse({ description: 'Invalid signup fields or password length' })
  @ApiConflictResponse({ description: 'Email already registered' })
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Log in to an existing account; issue access and refresh tokens' })
  @ApiOkResponse({ description: 'Safe user details, access token and refresh token' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Exchange a refresh token for a new access + refresh token pair',
    description: 'The submitted refresh token is invalidated. Reusing it later revokes the whole session.',
  })
  @ApiOkResponse({ description: 'New access token and new refresh token' })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired, or already-used refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the refresh token and its session' })
  @ApiNoContentResponse()
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }
}