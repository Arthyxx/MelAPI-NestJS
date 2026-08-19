import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import type { AuthUser } from '../common/types/auth-user.type';
import { ClientesService } from './clientes.service';
import {
  CreateAdminClienteDto,
  UpdateAdminClienteDto,
} from './dto/admin-cliente.dto';
import { ClienteFilterDto } from './dto/cliente-filter.dto';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { PatchClienteDto } from './dto/patch-cliente.dto';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin')
  createAdmin(@Body() dto: CreateAdminClienteDto) {
    return this.clientesService.createAdmin(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  findAll(@Query() filter: ClienteFilterDto) {
    return this.clientesService.findAll(filter);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMe(@CurrentUser() user: AuthUser) {
    return this.clientesService.findMe(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: PatchClienteDto) {
    return this.clientesService.updateMe(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.findById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminClienteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientesService.updateAdmin(id, dto, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminClienteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientesService.updateAdmin(id, dto, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.clientesService.delete(id, user.sub);
  }
}
