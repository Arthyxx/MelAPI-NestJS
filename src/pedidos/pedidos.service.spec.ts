import { StatusPedido } from '@prisma/client';

import { PedidosService } from './pedidos.service';
import { PedidoCreationService } from './services/pedido-creation.service';
import { PedidoLifecycleService } from './services/pedido-lifecycle.service';
import { PedidoQueryService } from './services/pedido-query.service';

describe('PedidosService', () => {
  let service: PedidosService;

  const pedidoQueryService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findMyPedidos: jest.fn(),
    findMyPedidoById: jest.fn(),
  };

  const pedidoCreationService = {
    create: jest.fn(),
  };

  const pedidoLifecycleService = {
    updateStatus: jest.fn(),
    iniciarCancelamentoComReembolso: jest.fn(),
    finalizarCancelamentoReembolsado: jest.fn(),
    expirarPedidoPendente: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new PedidosService(
      pedidoQueryService as unknown as PedidoQueryService,
      pedidoCreationService as unknown as PedidoCreationService,
      pedidoLifecycleService as unknown as PedidoLifecycleService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve delegar consultas para PedidoQueryService', async () => {
    pedidoQueryService.findAll.mockResolvedValue({ content: [] });
    pedidoQueryService.findById.mockResolvedValue({ id: 1 });
    pedidoQueryService.findMyPedidos.mockResolvedValue([]);
    pedidoQueryService.findMyPedidoById.mockResolvedValue({ id: 1 });

    await service.findAll({ page: 1, limit: 10 });
    await service.findById(1);
    await service.findMyPedidos(10);
    await service.findMyPedidoById(1, 10);

    expect(pedidoQueryService.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
    });
    expect(pedidoQueryService.findById).toHaveBeenCalledWith(1);
    expect(pedidoQueryService.findMyPedidos).toHaveBeenCalledWith(10);
    expect(pedidoQueryService.findMyPedidoById).toHaveBeenCalledWith(1, 10);
  });

  it('deve delegar criação para PedidoCreationService', async () => {
    const dto = {
      items: [
        {
          produtoId: 5,
          quantity: 2,
        },
      ],
      shippingServiceId: '1',
      quotedShippingPrice: 12.5,
      quotedZipCode: '60421410',
    };
    const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

    pedidoCreationService.create.mockResolvedValue({
      id: 1,
      status: StatusPedido.PENDENTE,
    });

    await service.create(10, dto, idempotencyKey);

    expect(pedidoCreationService.create).toHaveBeenCalledWith(
      10,
      dto,
      idempotencyKey,
    );
  });

  it('deve delegar lifecycle para PedidoLifecycleService', async () => {
    pedidoLifecycleService.updateStatus.mockResolvedValue({ id: 1 });
    pedidoLifecycleService.iniciarCancelamentoComReembolso.mockResolvedValue(
      undefined,
    );
    pedidoLifecycleService.finalizarCancelamentoReembolsado.mockResolvedValue({
      id: 1,
      status: StatusPedido.CANCELADO,
    });
    pedidoLifecycleService.expirarPedidoPendente.mockResolvedValue(true);

    await service.updateStatus(1, {
      status: StatusPedido.CONFIRMADO,
    });
    await service.iniciarCancelamentoComReembolso(1);
    await service.finalizarCancelamentoReembolsado(1);
    await service.expirarPedidoPendente(1);

    expect(pedidoLifecycleService.updateStatus).toHaveBeenCalledWith(1, {
      status: StatusPedido.CONFIRMADO,
    });
    expect(
      pedidoLifecycleService.iniciarCancelamentoComReembolso,
    ).toHaveBeenCalledWith(1);
    expect(
      pedidoLifecycleService.finalizarCancelamentoReembolsado,
    ).toHaveBeenCalledWith(1);
    expect(pedidoLifecycleService.expirarPedidoPendente).toHaveBeenCalledWith(
      1,
    );
  });
});
