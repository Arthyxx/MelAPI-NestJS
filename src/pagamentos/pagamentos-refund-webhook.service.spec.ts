import { Prisma, StatusPedido } from '@prisma/client';

import { PedidosService } from '../pedidos/pedidos.service';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from './mercado-pago.service';
import { PagamentosService } from './pagamentos.service';

describe('PagamentosService - webhook de reembolso', () => {
  let service: PagamentosService;

  const mercadoPagoService = {
    buscarPagamento: jest.fn(),
    listarReembolsos: jest.fn(),
    reembolsarPagamento: jest.fn(),
  };

  const pedidosService = {
    expirarPedidoPendente: jest.fn(),
    iniciarCancelamentoComReembolso: jest.fn(),
    finalizarCancelamentoReembolsado: jest.fn(),
  };

  let prisma: {
    pedido: {
      findUnique: jest.Mock;
    };

    pagamento: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };

    $transaction: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      pedido: {
        findUnique: jest.fn(),
      },

      pagamento: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },

      $transaction: jest.fn(),
    };

    service = new PagamentosService(
      prisma as unknown as PrismaService,
      mercadoPagoService as unknown as MercadoPagoService,
      pedidosService as unknown as PedidosService,
    );
  });

  it('deve reconciliar reembolso confirmado por webhook e cancelar pedido pago', async () => {
    const refundedAt = new Date('2026-09-16T17:30:00.000Z');

    mercadoPagoService.buscarPagamento.mockResolvedValue({
      paymentId: 'pay-refunded-123',
      status: 'refunded',
      statusDetail: 'refunded',
      externalReference: '1',
      transactionAmount: 75,
      approvedAt: new Date('2026-09-16T17:00:00.000Z'),
      pedidoId: 1,
    });

    mercadoPagoService.listarReembolsos.mockResolvedValue([
      {
        refundId: 'refund-123',
        paymentId: 'pay-refunded-123',
        amount: 75,
        status: 'approved',
        createdAt: refundedAt,
      },
    ]);

    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      totalPrice: new Prisma.Decimal('75.00'),
    });

    prisma.pagamento.findUnique.mockResolvedValue({
      id: 10,
      pedidoId: 1,
      paymentId: 'pay-refunded-123',
      status: 'approved',
      refundId: null,
      refundStatus: null,
      refundAmount: null,
      refundedAt: null,
    });

    prisma.pagamento.update.mockResolvedValue({});

    const tx = {
      pagamento: {
        update: jest.fn().mockResolvedValue({}),
      },

      pedido: {
        updateMany: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    pedidosService.iniciarCancelamentoComReembolso.mockResolvedValue(undefined);

    pedidosService.finalizarCancelamentoReembolsado.mockResolvedValue(
      undefined,
    );

    const result = await service.processarPagamentoWebhook('pay-refunded-123');

    expect(mercadoPagoService.listarReembolsos).toHaveBeenCalledWith(
      'pay-refunded-123',
    );

    expect(mercadoPagoService.reembolsarPagamento).not.toHaveBeenCalled();

    expect(prisma.pagamento.update).toHaveBeenCalledWith({
      where: {
        id: 10,
      },

      data: {
        refundId: 'refund-123',
        refundStatus: 'approved',
        refundAmount: new Prisma.Decimal('75'),
        refundedAt,
      },
    });

    expect(pedidosService.iniciarCancelamentoComReembolso).toHaveBeenCalledWith(
      1,
    );

    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).toHaveBeenCalledWith(1);

    expect(result).toEqual({
      received: true,
      pedidoId: 1,
      paymentId: 'pay-refunded-123',
      paymentStatus: 'refunded',
    });
  });
});
