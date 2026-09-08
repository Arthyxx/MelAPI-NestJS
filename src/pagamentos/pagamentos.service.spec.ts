import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, StatusCheckoutPedido, StatusPedido } from '@prisma/client';

import { PedidosService } from '../pedidos/pedidos.service';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from './mercado-pago.service';
import { PagamentosService } from './pagamentos.service';

describe('PagamentosService', () => {
  let service: PagamentosService;

  let prisma: {
    pedido: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };

    checkoutPedido: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };

    pagamento: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };

    $transaction: jest.Mock;
  };

  const mercadoPagoService = {
    criarPreferencia: jest.fn(),
    buscarPagamento: jest.fn(),
    reembolsarPagamento: jest.fn(),
  };

  const pedidosService = {
    expirarPedidoPendente: jest.fn(),
    iniciarCancelamentoComReembolso: jest.fn(),
    finalizarCancelamentoReembolsado: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      pedido: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },

      checkoutPedido: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve reutilizar checkout já pronto em vez de criar outra preferência', async () => {
    const expiration = new Date(Date.now() + 30 * 60_000);

    prisma.pedido.findFirst.mockResolvedValue({
      id: 1,
      clienteId: 10,
      status: StatusPedido.PENDENTE,
      paymentExpiresAt: expiration,
      shippingPrice: new Prisma.Decimal('10.00'),
      shippingServiceName: 'PAC',

      cliente: {
        id: 10,
        email: 'cliente@teste.com',
      },

      items: [
        {
          produtoId: 5,
          quantity: 1,
          unitPrice: new Prisma.Decimal('25.00'),

          produto: {
            id: 5,
            name: 'Mel Silvestre',
          },
        },
      ],
    });

    prisma.checkoutPedido.findUnique.mockResolvedValue({
      id: 1,
      pedidoId: 1,
      provider: 'MERCADO_PAGO',
      status: StatusCheckoutPedido.PRONTO,
      preferenceId: 'pref-123',
      checkoutUrl: 'https://checkout.test/pref-123',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.iniciarPagamento(10, 1);

    expect(result).toEqual({
      pedidoId: 1,
      preferenceId: 'pref-123',
      checkoutUrl: 'https://checkout.test/pref-123',
    });

    expect(mercadoPagoService.criarPreferencia).not.toHaveBeenCalled();

    expect(prisma.checkoutPedido.create).not.toHaveBeenCalled();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deve expirar pedido antes de iniciar pagamento quando prazo acabou', async () => {
    prisma.pedido.findFirst.mockResolvedValue({
      id: 1,
      clienteId: 10,
      status: StatusPedido.PENDENTE,
      paymentExpiresAt: new Date(Date.now() - 60_000),

      cliente: {
        id: 10,
        email: 'cliente@teste.com',
      },

      items: [
        {
          produtoId: 5,
          quantity: 1,
          unitPrice: new Prisma.Decimal('25.00'),

          produto: {
            id: 5,
            name: 'Mel Silvestre',
          },
        },
      ],
    });

    await expect(service.iniciarPagamento(10, 1)).rejects.toThrow(
      new BadRequestException('O prazo para pagamento deste pedido expirou.'),
    );

    expect(pedidosService.expirarPedidoPendente).toHaveBeenCalledWith(1);

    expect(mercadoPagoService.criarPreferencia).not.toHaveBeenCalled();
  });

  it('deve reembolsar pagamento aprovado e finalizar cancelamento', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      totalPrice: new Prisma.Decimal('75.00'),

      pagamentos: [
        {
          id: 10,
          pedidoId: 1,
          provider: 'MERCADO_PAGO',
          preferenceId: 'pref-123',
          paymentId: 'pay-123',
          status: 'approved',
          statusDetail: 'accredited',
          approvedAt: new Date(),
          refundId: null,
          refundStatus: null,
          refundAmount: null,
          refundedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    mercadoPagoService.reembolsarPagamento.mockResolvedValue({
      refundId: 'refund-123',
      paymentId: 'pay-123',
      amount: 75,
      status: 'approved',
      createdAt: new Date('2026-09-08T12:00:00.000Z'),
    });

    prisma.pagamento.update.mockResolvedValue({});

    pedidosService.iniciarCancelamentoComReembolso.mockResolvedValue(undefined);

    pedidosService.finalizarCancelamentoReembolsado.mockResolvedValue(
      undefined,
    );

    const result = await service.cancelarPedidoComReembolso(1);

    expect(pedidosService.iniciarCancelamentoComReembolso).toHaveBeenCalledWith(
      1,
    );

    expect(mercadoPagoService.reembolsarPagamento).toHaveBeenCalledWith(
      'pay-123',
    );

    expect(prisma.pagamento.update).toHaveBeenCalledWith({
      where: {
        id: 10,
      },

      data: {
        refundId: 'refund-123',
        refundStatus: 'approved',
        refundAmount: new Prisma.Decimal('75'),
        refundedAt: new Date('2026-09-08T12:00:00.000Z'),
      },
    });

    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).toHaveBeenCalledWith(1);

    expect(result).toEqual({
      pedidoId: 1,
      status: StatusPedido.CANCELADO,
      refunded: true,
      refundId: 'refund-123',
      refundAmount: 75,
    });
  });

  it('não deve cancelar pedido quando o Mercado Pago não confirmar o reembolso', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      totalPrice: new Prisma.Decimal('75.00'),

      pagamentos: [
        {
          id: 10,
          paymentId: 'pay-123',
          status: 'approved',
          refundId: null,
          refundStatus: null,
          refundAmount: null,
        },
      ],
    });

    mercadoPagoService.reembolsarPagamento.mockResolvedValue({
      refundId: 'refund-123',
      paymentId: 'pay-123',
      amount: 75,
      status: 'pending',
      createdAt: new Date(),
    });

    await expect(service.cancelarPedidoComReembolso(1)).rejects.toThrow(
      new ServiceUnavailableException(
        'O Mercado Pago ainda não confirmou o reembolso.',
      ),
    );

    expect(pedidosService.iniciarCancelamentoComReembolso).toHaveBeenCalledWith(
      1,
    );

    expect(prisma.pagamento.update).not.toHaveBeenCalled();

    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).not.toHaveBeenCalled();
  });

  it('não deve finalizar cancelamento quando valor reembolsado for diferente do pedido', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      totalPrice: new Prisma.Decimal('75.00'),

      pagamentos: [
        {
          id: 10,
          paymentId: 'pay-123',
          status: 'approved',
          refundId: null,
          refundStatus: null,
          refundAmount: null,
        },
      ],
    });

    mercadoPagoService.reembolsarPagamento.mockResolvedValue({
      refundId: 'refund-123',
      paymentId: 'pay-123',
      amount: 50,
      status: 'approved',
      createdAt: new Date(),
    });

    await expect(service.cancelarPedidoComReembolso(1)).rejects.toThrow(
      new ServiceUnavailableException(
        'O valor reembolsado não corresponde ao valor total do pedido.',
      ),
    );

    expect(prisma.pagamento.update).not.toHaveBeenCalled();

    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).not.toHaveBeenCalled();
  });

  it('deve reutilizar reembolso já aprovado sem chamar Mercado Pago novamente', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.CANCELAMENTO_PENDENTE,
      totalPrice: new Prisma.Decimal('75.00'),

      pagamentos: [
        {
          id: 10,
          paymentId: 'pay-123',
          status: 'approved',
          refundId: 'refund-123',
          refundStatus: 'approved',
          refundAmount: new Prisma.Decimal('75.00'),
          refundedAt: new Date(),
        },
      ],
    });

    pedidosService.finalizarCancelamentoReembolsado.mockResolvedValue(
      undefined,
    );

    const result = await service.cancelarPedidoComReembolso(1);

    expect(mercadoPagoService.reembolsarPagamento).not.toHaveBeenCalled();

    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).toHaveBeenCalledWith(1);

    expect(result).toEqual({
      pedidoId: 1,
      status: StatusPedido.CANCELADO,
      refunded: true,
      refundId: 'refund-123',
      refundAmount: 75,
    });
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
      })
      .mockResolvedValueOnce({
        status: StatusPedido.PAGO,
      });

    prisma.pagamento.findUnique.mockResolvedValue({
      id: 10,
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
      })
      .mockResolvedValueOnce({
        status: StatusPedido.CANCELADO,
      });

    prisma.pagamento.findUnique
      .mockResolvedValueOnce({
        id: 10,
        paymentId: 'pay-late-123',
      })
      .mockResolvedValueOnce({
        id: 10,
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
