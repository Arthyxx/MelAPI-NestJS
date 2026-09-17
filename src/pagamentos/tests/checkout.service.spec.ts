import { BadRequestException } from '@nestjs/common';
import { Prisma, StatusCheckoutPedido, StatusPedido } from '@prisma/client';

import { PedidosService } from '../../pedidos/pedidos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MercadoPagoService } from '../mercado-pago.service';
import { CheckoutService } from '../services/checkout.service';

describe('CheckoutService', () => {
  let service: CheckoutService;

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

  const mercadoPagoService = {
    criarPreferencia: jest.fn(),
  };

  const pedidosService = {
    expirarPedidoPendente: jest.fn(),
  };

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

    service = new CheckoutService(
      prisma as unknown as PrismaService,
      mercadoPagoService as unknown as MercadoPagoService,
      pedidosService as unknown as PedidosService,
    );
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
});
