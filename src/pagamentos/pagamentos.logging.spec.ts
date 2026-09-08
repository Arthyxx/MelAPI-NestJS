import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, StatusPedido } from '@prisma/client';

import { PedidosService } from '../pedidos/pedidos.service';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from './mercado-pago.service';
import { PagamentosService } from './pagamentos.service';

describe('PagamentosService - logs seguros', () => {
  let service: PagamentosService;
  let loggerErrorSpy: jest.SpyInstance;

  const prisma = {
    pedido: {
      findFirst: jest.fn(),
    },

    checkoutPedido: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mercadoPagoService = {
    criarPreferencia: jest.fn(),
  };

  const pedidosService = {
    expirarPedidoPendente: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    service = new PagamentosService(
      prisma as unknown as PrismaService,
      mercadoPagoService as unknown as MercadoPagoService,
      pedidosService as unknown as PedidosService,
    );
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('não deve expor detalhes sensíveis quando falhar ao marcar checkout como falho', async () => {
    prisma.pedido.findFirst.mockResolvedValue({
      id: 1,
      clienteId: 10,
      status: StatusPedido.PENDENTE,
      paymentExpiresAt: new Date(Date.now() + 30 * 60_000),
      shippingPrice: new Prisma.Decimal('0'),

      cliente: {
        id: 10,
        email: 'cliente@teste.com',
      },

      items: [
        {
          produtoId: 5,
          quantity: 1,
          unitPrice: new Prisma.Decimal('25'),

          produto: {
            id: 5,
            name: 'Mel Silvestre',
          },
        },
      ],
    });

    prisma.checkoutPedido.findUnique.mockResolvedValue(null);

    prisma.checkoutPedido.create.mockResolvedValue({});

    mercadoPagoService.criarPreferencia.mockRejectedValue(
      new ServiceUnavailableException('Não foi possível iniciar o pagamento.'),
    );

    prisma.checkoutPedido.updateMany.mockRejectedValue(
      new Error('DATABASE_URL=postgresql://usuario:senha@servidor/banco'),
    );

    await expect(service.iniciarPagamento(10, 1)).rejects.toThrow(
      new ServiceUnavailableException('Não foi possível iniciar o pagamento.'),
    );

    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Não foi possível marcar o checkout do pedido 1 como falho. Tipo: Error.',
    );

    expect(loggerErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('DATABASE_URL'),
    );

    expect(loggerErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('postgresql://'),
    );

    expect(loggerErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('senha'),
    );
  });
});
