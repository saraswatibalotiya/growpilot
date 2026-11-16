import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsIn, IsOptional } from 'class-validator';

export class PublishPostDto {
  @ApiProperty({ example: true, description: 'Must be true. It records that the owner pressed "Approve and publish".' })
  @Equals(true, { message: 'confirm must be true: the owner has to explicitly approve publishing' })
  confirm: boolean;

  @ApiPropertyOptional({ enum: ['post', 'reel'], default: 'post', description: 'post: photo or carousel. reel: a vertical slideshow video of the slides.' })
  @IsOptional()
  @IsIn(['post', 'reel'])
  format?: 'post' | 'reel';
}
