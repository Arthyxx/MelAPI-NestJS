import { Injectable } from '@nestjs/common';

import { CreatePedidoDto } from './dto/create-pedido.dto';
import { PedidoFilterDto } from './dto/pedido-filter.dto';
import { UpdateStatusPedidoDto } from './dto/update-status-pedido.dto';
import { PedidoCreationService } from './services/pedido-creation.service';
import { PedidoLifecycleService } from './services/pedido-lifecycle.service';
import { PedidoQueryService } from './services/pedido-query.service';

@Injectable()
export class PedidosService {
  constructor(
    private readonly pedidoQueryService: PedidoQueryService,
    private readonly pedidoCreationService: PedidoCreationService,
    private readonly pedidoLifecycleService: PedidoLifecycleService,
  ) {}

  findAll(filter: PedidoFilterDto) {
    return this.pedidoQueryService.findAll(filter);
  }

  findById(id: number) {
    return this.pedidoQueryService.findById(id);
  }

  findMyPedidos(clienteId: number) {
    return this.pedidoQueryService.findMyPedidos(clienteId);
  }

  findMyPedidoById(id: number, clienteId: number) {
    return this.pedidoQueryService.findMyPedidoById(id, clienteId);
  }

  create(clienteId: number, dto: CreatePedidoDto, idempotencyKey: string) {
    return this.pedidoCreationService.create(clienteId, dto, idempotencyKey);
  }

  updateStatus(id: number, dto: UpdateStatusPedidoDto) {
    return this.pedidoLifecycleService.updateStatus(id, dto);
  }

  iniciarCancelamentoComReembolso(id: number) {
    return this.pedidoLifecycleService.iniciarCancelamentoComReembolso(id);
  }

  finalizarCancelamentoReembolsado(id: number) {
    return this.pedidoLifecycleService.finalizarCancelamentoReembolsado(id);
  }

  expirarPedidoPendente(id: number) {
    return this.pedidoLifecycleService.expirarPedidoPendente(id);
  }
}
