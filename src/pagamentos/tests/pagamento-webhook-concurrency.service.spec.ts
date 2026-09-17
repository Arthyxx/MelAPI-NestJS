import { Prisma, StatusPedido } from '@prisma/client';

import { PedidosService } from '../../pedidos/pedidos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MercadoPagoService } from '../mercado-pago.service';
import { PagamentoWebhookService } from '../services/pagamento-webhook.service';
import { ReembolsoWebhookService } from '../services/reembolso-webhook.service';

describe('PagamentosService - concorrência de pagamentos', () => {
  let service: PagamentoWebhookService;

  const prisma = {
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

  const mercadoPagoService = {
    criarPreferencia: jest.fn(),
    buscarPagamento: jest.fn(),
    reembolsarPagamento: jest.fn(),
    listarReembolsos: jest.fn(),
  };

  const pedidosService = {
    expirarPedidoPendente: jest.fn(),
    iniciarCancelamentoComReembolso: jest.fn(),
    finalizarCancelamentoReembolsado: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

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

  it('deve reembolsar o segundo pagamento aprovado quando outro pagamento vencer a corrida pelo pedido', async () => {
    mercadoPagoService.buscarPagamento.mockResolvedValue({
      paymentId: 'pay-second',
      status: 'approved',
      statusDetail: 'accredited',
      externalReference: '1',
      transactionAmount: 75,
      approvedAt: new Date('2026-09-16T15:00:00.000Z'),
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
        paidPaymentId: 'pay-first',
      });

    prisma.pagamento.findUnique
      .mockResolvedValueOnce({
        id: 20,
        pedidoId: 1,
        paymentId: 'pay-second',
        status: 'pending',
      })
      .mockResolvedValueOnce({
        id: 20,
        pedidoId: 1,
        paymentId: 'pay-second',
        status: 'approved',
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
      refundId: 'refund-second',
      paymentId: 'pay-second',
      amount: 75,
      status: 'approved',
      createdAt: new Date('2026-09-16T15:01:00.000Z'),
    });

    prisma.pagamento.update.mockResolvedValue({});

    await service.processarPagamentoWebhook('pay-second');

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        status: StatusPedido.PENDENTE,
      },

      data: {
        status: StatusPedido.PAGO,
        paidPaymentId: 'pay-second',
      },
    });

    expect(mercadoPagoService.reembolsarPagamento).toHaveBeenCalledWith(
      'pay-second',
    );

    expect(prisma.pagamento.update).toHaveBeenCalledWith({
      where: {
        id: 20,
      },

      data: {
        refundId: 'refund-second',
        refundStatus: 'approved',
        refundAmount: new Prisma.Decimal('75'),
        refundedAt: new Date('2026-09-16T15:01:00.000Z'),
      },
    });
  });

  it('não deve reembolsar webhook repetido do pagamento que venceu o pedido', async () => {
    mercadoPagoService.buscarPagamento.mockResolvedValue({
      paymentId: 'pay-first',
      status: 'approved',
      statusDetail: 'accredited',
      externalReference: '1',
      transactionAmount: 75,
      approvedAt: new Date('2026-09-16T14:59:00.000Z'),
      pedidoId: 1,
    });

    prisma.pedido.findUnique
      .mockResolvedValueOnce({
        id: 1,
        status: StatusPedido.PAGO,
        totalPrice: new Prisma.Decimal('75.00'),
        paidPaymentId: 'pay-first',
      })
      .mockResolvedValueOnce({
        status: StatusPedido.PAGO,
        paidPaymentId: 'pay-first',
      });

    prisma.pagamento.findUnique.mockResolvedValue({
      id: 10,
      pedidoId: 1,
      paymentId: 'pay-first',
      status: 'approved',
      refundId: null,
      refundStatus: null,
      refundAmount: null,
    });

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

    const result = await service.processarPagamentoWebhook('pay-first');

    expect(tx.pedido.updateMany).not.toHaveBeenCalled();
    expect(mercadoPagoService.reembolsarPagamento).not.toHaveBeenCalled();

    expect(result).toEqual({
      received: true,
      pedidoId: 1,
      paymentId: 'pay-first',
      paymentStatus: 'approved',
    });
  });

  it('não deve sobrescrever uma tentativa pendente que outro webhook já assumiu', async () => {
    mercadoPagoService.buscarPagamento.mockResolvedValue({
      paymentId: 'pay-second',
      status: 'approved',
      statusDetail: 'accredited',
      externalReference: '1',
      transactionAmount: 75,
      approvedAt: new Date('2026-09-17T13:00:00.000Z'),
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
        paidPaymentId: 'pay-first',
      });

    prisma.pagamento.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 21,
        pedidoId: 1,
        paymentId: 'pay-second',
        status: 'approved',
        refundId: null,
        refundStatus: null,
        refundAmount: null,
      });

    prisma.pagamento.findFirst.mockResolvedValue({
      id: 10,
      pedidoId: 1,
      provider: 'MERCADO_PAGO',
      paymentId: null,
      status: 'pending',
    });

    const tx = {
      pagamento: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({
          count: 0,
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 21,
          pedidoId: 1,
          paymentId: 'pay-second',
          status: 'approved',
        }),
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
      refundId: 'refund-second',
      paymentId: 'pay-second',
      amount: 75,
      status: 'approved',
      createdAt: new Date('2026-09-17T13:01:00.000Z'),
    });

    prisma.pagamento.update.mockResolvedValue({});

    await service.processarPagamentoWebhook('pay-second');

    expect(tx.pagamento.updateMany).toHaveBeenCalledWith({
      where: {
        id: 10,
        paymentId: null,
      },

      data: {
        paymentId: 'pay-second',
        status: 'approved',
        statusDetail: 'accredited',
        approvedAt: new Date('2026-09-17T13:00:00.000Z'),
      },
    });

    expect(tx.pagamento.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 10,
        },
      }),
    );

    expect(tx.pagamento.create).toHaveBeenCalledWith({
      data: {
        pedidoId: 1,
        provider: 'MERCADO_PAGO',
        paymentId: 'pay-second',
        status: 'approved',
        statusDetail: 'accredited',
        approvedAt: new Date('2026-09-17T13:00:00.000Z'),
      },
    });

    expect(mercadoPagoService.reembolsarPagamento).toHaveBeenCalledWith(
      'pay-second',
    );
  });

  it('deve recuperar concorrência P2002 quando dois webhooks do mesmo pagamento chegarem simultaneamente', async () => {
    mercadoPagoService.buscarPagamento.mockResolvedValue({
      paymentId: 'pay-same',
      status: 'approved',
      statusDetail: 'accredited',
      externalReference: '1',
      transactionAmount: 75,
      approvedAt: new Date('2026-09-17T13:10:00.000Z'),
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
        paidPaymentId: 'pay-same',
      });

    prisma.pagamento.findUnique
      // Antes da corrida, este webhook ainda não enxerga o registro
      // criado pela outra transação.
      .mockResolvedValueOnce(null)
      // Depois do P2002, a transação vencedora já foi confirmada.
      .mockResolvedValueOnce({
        id: 30,
        pedidoId: 1,
        provider: 'MERCADO_PAGO',
        paymentId: 'pay-same',
        status: 'approved',
        statusDetail: 'accredited',
        approvedAt: new Date('2026-09-17T13:10:00.000Z'),
        refundId: null,
        refundStatus: null,
        refundAmount: null,
      });

    prisma.pagamento.findFirst.mockResolvedValue(null);

    const uniqueConstraintError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on paymentId',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: {
          target: ['paymentId'],
        },
      },
    );

    prisma.$transaction.mockRejectedValue(uniqueConstraintError);

    const result = await service.processarPagamentoWebhook('pay-same');

    expect(prisma.pagamento.findUnique).toHaveBeenCalledTimes(2);

    expect(prisma.pagamento.findUnique).toHaveBeenLastCalledWith({
      where: {
        paymentId: 'pay-same',
      },
    });

    expect(mercadoPagoService.reembolsarPagamento).not.toHaveBeenCalled();

    expect(result).toEqual({
      received: true,
      pedidoId: 1,
      paymentId: 'pay-same',
      paymentStatus: 'approved',
    });
  });
});
