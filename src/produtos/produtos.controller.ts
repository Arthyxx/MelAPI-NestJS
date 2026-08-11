import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  Roles,
  RolesGuard,
} from '../common/guards/roles.guard';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { PatchProdutoDto } from './dto/patch-produto.dto';
import { ProdutoFilterDto } from './dto/produto-filter.dto';
import { PutProdutoDto } from './dto/put-produto.dto';
import { ProdutosService } from './produtos.service';

@Controller('produtos')
export class ProdutosController {
  constructor(
    private readonly produtosService: ProdutosService,
  ) {}

  @Get()
  findAllPublic(
    @Query() filter: ProdutoFilterDto,
  ) {
    return this.produtosService.findAllPublic(
      filter,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  findAllAdmin(
    @Query() filter: ProdutoFilterDto,
  ) {
    return this.produtosService.findAllAdmin(
      filter,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/:id')
  findByIdAdmin(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.produtosService.findByIdAdmin(
      id,
    );
  }

  @Get(':id')
  findByIdPublic(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.produtosService.findByIdPublic(
      id,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProdutoDto) {
    return this.produtosService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PutProdutoDto,
  ) {
    return this.produtosService.update(
      id,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchProdutoDto,
  ) {
    return this.produtosService.partialUpdate(
      id,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.produtosService.delete(id);
  }
}