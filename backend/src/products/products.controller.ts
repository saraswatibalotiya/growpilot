import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './products.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @ApiOperation({ summary: "Add a product to the owner's business" })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateProductDto) {
    return this.products.create(req.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the owner's products (newest first, paginated)" })
  list(@Req() req: AuthenticatedRequest, @Query() query: ListProductsQueryDto) {
    return this.products.list(req.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One product (owner only)' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  get(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(req.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product; only the fields you send change' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  update(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(req.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a product. Posts that used it keep their history without the link.' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(req.userId, id);
  }
}
