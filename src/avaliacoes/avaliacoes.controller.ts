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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthUser } from '../common/types/auth-user.type';
import { AvaliacoesService } from './avaliacoes.service';
import { CreateAvaliacaoProdutoDto } from './dto/create-avaliacao-produto.dto';
import { PatchAvaliacaoProdutoDto } from './dto/patch-avaliacao-produto.dto';

@Controller('produtos/:produtoId/avaliacoes')
export class AvaliacoesController {
  constructor(private readonly avaliacoesService: AvaliacoesService) {}

  @Get()
  findByProdutoId(@Param('produtoId', ParseIntPipe) produtoId: number) {
    return this.avaliacoesService.findByProdutoId(produtoId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pode-avaliar')
  canReview(
    @Param('produtoId', ParseIntPipe) produtoId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.avaliacoesService.canReview(produtoId, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('produtoId', ParseIntPipe) produtoId: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAvaliacaoProdutoDto,
  ) {
    return this.avaliacoesService.create(produtoId, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('minha')
  updateMinhaAvaliacao(
    @Param('produtoId', ParseIntPipe) produtoId: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: PatchAvaliacaoProdutoDto,
  ) {
    return this.avaliacoesService.updateMinhaAvaliacao(
      produtoId,
      user.sub,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('minha')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMinhaAvaliacao(
    @Param('produtoId', ParseIntPipe) produtoId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.avaliacoesService.deleteMinhaAvaliacao(produtoId, user.sub);
  }
}