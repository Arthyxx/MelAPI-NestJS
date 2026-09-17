import { Prisma, StatusPedido } from '@prisma/client';

import { PedidosService } from '../../pedidos/pedidos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MercadoPagoService } from '../mercado-pago.service';
import { PagamentoWebhookService } from '../services/pagamento-webhook.service';
import { ReembolsoWebhookService } from '../services/reembolso-webhook.service';

describe('PagamentoWebhookService', () => {
  let service: PagamentoWebhookService;

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

  const mercadoPagoService = {
    buscarPagamento: jest.fn(),
    reembolsarPagamento: jest.fn(),
    listarReembolsos: jest.fn(),
  };

  const pedidosService = {
    iniciarCancelamentoComReembolso: jest.fn(),
    finalizarCancelamentoReembolsado: jest.fn(),
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

    const reembolsoWebhookService = new ReembolsoWebhookService(
      prisma as unknown as PrismaService,
      mercadoPagoService as unknown as MercadoPagoService,
      pedidosService as unknown as PedidosService,
    );

    service = new PagamentoWebhookService(
      prisma as unknown as PrismaService,
      mercadoPagoService as unknown as MercadoPagoService,
      pedidosService as unknown as PedidosService,
      reembolsoWebhookService,
    );
  });

  it('deve transformar pedido pendente em pago após webhook aprovado', async () => {
    mercadoPagoService.buscarPagamento.mockResolvedValue({
      paymentId: 'pay-123',
      status: 'approved',
      statusDetail: 'accredited',
      externalReference: '1',
      transactionAmount: 75,
      approvedAt: new Date('2026-09-08T12:00:00.000Z'),
      pedidoId: 1,
    });

    prisma.pedido.findUnique
      .mockResolvedValueOnce({
        id: 1,
        status: StatusPedido.PENDENTE,
        totalPrice: new Prisma.Decimal('75.00'),
        paidPaymentId: null,
      })
      .mockResolvedValueOnce({
        status: StatusPedido.PAGO,
        paidPaymentId: 'pay-123',
      });

    prisma.pagamento.findUnique.mockResolvedValue({
      id: 10,
      pedidoId: 1,
      paymentId: 'pay-123',
    });

    const tx = {
      pagamento: {
        update: jest.fn().mockResolvedValue({}),
      },

      pedido: {
        updateMany: jest.fn().mockResolvedValue({
          count: 1,
        }),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    const result = await service.processarPagamentoWebhook('pay-123');

    expect(tx.pagamento.update).toHaveBeenCalledWith({
      where: {
        id: 10,
      },

      data: {
        paymentId: 'pay-123',
        status: 'approved',
        statusDetail: 'accredited',
        approvedAt: new Date('2026-09-08T12:00:00.000Z'),
      },
    });

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        status: StatusPedido.PENDENTE,
      },

      data: {
        status: StatusPedido.PAGO,
        paidPaymentId: 'pay-123',
      },
    });

    expect(mercadoPagoService.reembolsarPagamento).not.toHaveBeenCalled();

    expect(result).toEqual({
      received: true,
      pedidoId: 1,
      paymentId: 'pay-123',
      paymentStatus: 'approved',
    });
  });

  it('deve reembolsar automaticamente quando pedido for cancelado durante confirmação do pagamento', async () => {
    mercadoPagoService.buscarPagamento.mockResolvedValue({
      paymentId: 'pay-late-123',
      status: 'approved',
      statusDetail: 'accredited',
      externalReference: '1',
      transactionAmount: 75,
      approvedAt: new Date('2026-09-08T12:00:00.000Z'),
      pedidoId: 1,
    });

    prisma.pedido.findUnique
      .mockResolvedValueOnce({
        id: 1,
        status: StatusPedido.PENDENTE,
        totalPrice: new Prisma.Decimal('75.00'),
        paidPaymentId: null,
      })
      .mockResolvedValueOnce({
        status: StatusPedido.CANCELADO,
        paidPaymentId: null,
      });

    prisma.pagamento.findUnique
      .mockResolvedValueOnce({
        id: 10,
        pedidoId: 1,
        paymentId: 'pay-late-123',
      })
      .mockResolvedValueOnce({
        id: 10,
        pedidoId: 1,
        paymentId: 'pay-late-123',
        refundId: null,
        refundStatus: null,
        refundAmount: null,
      });

    const tx = {
      pagamento: {
        update: jest.fn().mockResolvedValue({}),
      },

      pedido: {
        updateMany: jest.fn().mockResolvedValue({
          count: 0,
        }),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    mercadoPagoService.reembolsarPagamento.mockResolvedValue({
      refundId: 'refund-late-123',
      paymentId: 'pay-late-123',
      amount: 75,
      status: 'approved',
      createdAt: new Date('2026-09-08T12:05:00.000Z'),
    });

    prisma.pagamento.update.mockResolvedValue({});

    const result = await service.processarPagamentoWebhook('pay-late-123');

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        status: StatusPedido.PENDENTE,
      },

      data: {
        status: StatusPedido.PAGO,
        paidPaymentId: 'pay-late-123',
      },
    });

    expect(mercadoPagoService.reembolsarPagamento).toHaveBeenCalledWith(
      'pay-late-123',
    );

    expect(prisma.pagamento.update).toHaveBeenCalledWith({
      where: {
        id: 10,
      },

      data: {
        refundId: 'refund-late-123',
        refundStatus: 'approved',
        refundAmount: new Prisma.Decimal('75'),
        refundedAt: new Date('2026-09-08T12:05:00.000Z'),
      },
    });

    expect(result).toEqual({
      received: true,
      pedidoId: 1,
      paymentId: 'pay-late-123',
      paymentStatus: 'approved',
    });
  });
});
