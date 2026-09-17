import { Injectable } from '@nestjs/common';

import {
  CreateAdminClienteDto,
  UpdateAdminClienteDto,
} from './dto/admin-cliente.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ClienteFilterDto } from './dto/cliente-filter.dto';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { PatchClienteDto } from './dto/patch-cliente.dto';
import { ClienteAccountService } from './services/cliente-account.service';
import { ClienteAdminService } from './services/cliente-admin.service';
import { ClienteQueryService } from './services/cliente-query.service';

@Injectable()
export class ClientesService {
  constructor(
    private readonly clienteQueryService: ClienteQueryService,
    private readonly clienteAccountService: ClienteAccountService,
    private readonly clienteAdminService: ClienteAdminService,
  ) {}

  findAll(filter: ClienteFilterDto) {
    return this.clienteQueryService.findAll(filter);
  }

  findById(id: number) {
    return this.clienteQueryService.findById(id);
  }

  findMe(clienteId: number) {
    return this.clienteQueryService.findMe(clienteId);
  }

  create(dto: CreateClienteDto) {
    return this.clienteAccountService.create(dto);
  }

  createAdmin(dto: CreateAdminClienteDto) {
    return this.clienteAdminService.createAdmin(dto);
  }

  updateMe(clienteId: number, dto: PatchClienteDto) {
    return this.clienteAccountService.updateMe(clienteId, dto);
  }

  changePassword(clienteId: number, dto: ChangePasswordDto) {
    return this.clienteAccountService.changePassword(clienteId, dto);
  }

  updateAdmin(id: number, dto: UpdateAdminClienteDto, currentAdminId: number) {
    return this.clienteAdminService.updateAdmin(id, dto, currentAdminId);
  }

  update(id: number, dto: CreateClienteDto) {
    return this.clienteAccountService.update(id, dto);
  }

  partialUpdate(id: number, dto: PatchClienteDto) {
    return this.clienteAccountService.partialUpdate(id, dto);
  }

  delete(id: number, currentAdminId: number) {
    return this.clienteAdminService.delete(id, currentAdminId);
  }
}
