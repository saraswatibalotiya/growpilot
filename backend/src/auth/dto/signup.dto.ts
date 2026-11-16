import { ApiProperty } from '@nestjs/swagger';
import { BUSINESS_CATEGORIES, type BusinessCategory } from '../../common/constants';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SignupBusinessDto {
  @ApiProperty({ example: 'Sunday Staples', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: BUSINESS_CATEGORIES, example: 'clothing' })
  @IsIn(BUSINESS_CATEGORIES)
  category: BusinessCategory;
}

export class SignupDto {
  @ApiProperty({ example: 'Sara', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'sara@example.com', maxLength: 254 })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().normalize('NFC').toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 12, maxLength: 72, writeOnly: true, format: 'password' })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password: string;

  @ApiProperty({ type: SignupBusinessDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SignupBusinessDto)
  business: SignupBusinessDto;
}