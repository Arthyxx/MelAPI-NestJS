import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import type { AuthUser } from '../common/types/auth-user.type';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { PedidoFilterDto } from './dto/pedido-filter.dto';
import { UpdateStatusPedidoDto } from './dto/update-status-pedido.dto';
import { PedidosService } from './pedidos.service';

const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  findAll(@Query() filter: PedidoFilterDto) {
    return this.pedidosService.findAll(filter);
  }

  @UseGuards(JwtAuthGuard)
  @Get('meus-pedidos')
  findMyPedidos(@CurrentUser() user: AuthUser) {
    return this.pedidosService.findMyPedidos(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('meus-pedidos/:id')
  findMyPedidoById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pedidosService.findMyPedidoById(id, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePedidoDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const normalizedIdempotencyKey = idempotencyKey?.trim().toLowerCase();

    if (
      !normalizedIdempotencyKey ||
      !IDEMPOTENCY_KEY_REGEX.test(normalizedIdempotencyKey)
    ) {
      throw new BadRequestException(
        'Informe uma chave de idempotência válida no header Idempotency-Key.',
      );
    }

    return this.pedidosService.create(user.sub, dto, normalizedIdempotencyKey);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusPedidoDto,
  ) {
    return this.pedidosService.updateStatus(id, dto);
  }
}
