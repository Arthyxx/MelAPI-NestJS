import { ConflictException } from '@nestjs/common';
import { Prisma, StatusCheckoutPedido, StatusPedido } from '@prisma/client';

import { PedidosService } from '../pedidos/pedidos.service';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from './mercado-pago.service';
import { PagamentosService } from './pagamentos.service';

describe('PagamentosService - recuperação de checkout', () => {
  let service: PagamentosService;

  const mercadoPagoService = {
    criarPreferencia: jest.fn(),
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
      findFirst: jest.Mock;
    };

    checkoutPedido: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };

    pagamento: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };

    $transaction: jest.Mock;
  };

  const createPedido = () => ({
    id: 1,
    clienteId: 10,
    status: StatusPedido.PENDENTE,
    paymentExpiresAt: new Date(Date.now() + 30 * 60_000),
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

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      pedido: {
        findFirst: jest.fn(),
      },

      checkoutPedido: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },

      pagamento: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },

      $transaction: jest.fn(),
    };

    service = new PagamentosService(
      prisma as unknown as PrismaService,
      mercadoPagoService as unknown as MercadoPagoService,
      pedidosService as unknown as PedidosService,
    );
  });

  it('deve manter bloqueio quando checkout CRIANDO ainda for recente', async () => {
    prisma.pedido.findFirst.mockResolvedValue(createPedido());

    prisma.checkoutPedido.findUnique.mockResolvedValue({
      id: 20,
      pedidoId: 1,
      provider: 'MERCADO_PAGO',
      status: StatusCheckoutPedido.CRIANDO,
      preferenceId: null,
      checkoutUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(service.iniciarPagamento(10, 1)).rejects.toThrow(
      new ConflictException(
        'O checkout deste pedido já está sendo criado. Tente novamente em instantes.',
      ),
    );

    expect(mercadoPagoService.criarPreferencia).not.toHaveBeenCalled();
  });

  it('deve recuperar checkout CRIANDO antigo e permitir nova tentativa', async () => {
    prisma.pedido.findFirst.mockResolvedValue(createPedido());

    const staleDate = new Date(Date.now() - 5 * 60_000);

    prisma.checkoutPedido.findUnique.mockResolvedValue({
      id: 20,
      pedidoId: 1,
      provider: 'MERCADO_PAGO',
      status: StatusCheckoutPedido.CRIANDO,
      preferenceId: null,
      checkoutUrl: null,
      createdAt: staleDate,
      updatedAt: staleDate,
    });

    prisma.checkoutPedido.updateMany.mockResolvedValue({
      count: 1,
    });

    mercadoPagoService.criarPreferencia.mockResolvedValue({
      preferenceId: 'pref-recuperada',
      checkoutUrl: 'https://checkout.test/pref-recuperada',
    });

    const tx = {
      checkoutPedido: {
        update: jest.fn().mockResolvedValue({}),

        updateMany: jest.fn().mockResolvedValue({
          count: 1,
        }),
      },

      pagamento: {
        findUnique: jest.fn().mockResolvedValue(null),

        create: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    const result = await service.iniciarPagamento(10, 1);

    expect(mercadoPagoService.criarPreferencia).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      pedidoId: 1,
      preferenceId: 'pref-recuperada',
      checkoutUrl: 'https://checkout.test/pref-recuperada',
    });
  });
});
