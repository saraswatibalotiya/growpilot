import { ApiProperty } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'sara@example.com', maxLength: 254 })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().normalize('NFC').toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ maxLength: 72, writeOnly: true, format: 'password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token from signup, login or a previous refresh', writeOnly: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refreshToken: string;
}
