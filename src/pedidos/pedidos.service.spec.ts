import { BadRequestException } from '@nestjs/common';
import { Prisma, StatusPedido } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PedidoShippingService } from './pedido-shipping.service';
import { PedidosService } from './pedidos.service';

describe('PedidosService', () => {
  let service: PedidosService;

  let prisma: {
    cliente: {
      findUnique: jest.Mock;
    };
    produto: {
      findMany: jest.Mock;
    };
    pedido: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const pedidoShippingService = {
    prepararFrete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      cliente: {
        findUnique: jest.fn(),
      },

      produto: {
        findMany: jest.fn(),
      },

      pedido: {
        findUnique: jest.fn(),
      },

      $transaction: jest.fn(),
    };

    pedidoShippingService.prepararFrete.mockResolvedValue({
      shippingPrice: 25.9,
      shippingServiceId: '1',
      shippingServiceName: 'PAC',
      shippingCompanyName: 'Correios',
      shippingDeliveryTime: 6,

      shippingZipCode: '62300000',
      shippingStreet: 'Rua Principal',
      shippingAddressNumber: '123',
      shippingComplement: null,
      shippingNeighborhood: 'Centro',
      shippingCity: 'Viçosa do Ceará',
      shippingState: 'CE',
    });

    service = new PedidosService(
      prisma as unknown as PrismaService,
      pedidoShippingService as unknown as PedidoShippingService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve rejeitar produto duplicado no mesmo pedido', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 1,
    });

    const dto = {
      items: [
        {
          produtoId: 10,
          quantity: 1,
        },
        {
          produtoId: 10,
          quantity: 2,
        },
      ],
      shippingServiceId: '1',
    };

    await expect(service.create(1, dto)).rejects.toThrow(
      new BadRequestException(
        'Não envie o mesmo produto mais de uma vez no pedido.',
      ),
    );

    expect(prisma.produto.findMany).not.toHaveBeenCalled();

    expect(pedidoShippingService.prepararFrete).not.toHaveBeenCalled();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deve rejeitar pedido quando o estoque inicial é insuficiente', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 1,
    });

    prisma.produto.findMany.mockResolvedValue([
      {
        id: 10,
        name: 'Mel Silvestre',
        active: true,
        stockQuantity: 1,
        price: new Prisma.Decimal('25.00'),
      },
    ]);

    const dto = {
      items: [
        {
          produtoId: 10,
          quantity: 2,
        },
      ],
      shippingServiceId: '1',
    };

    await expect(service.create(1, dto)).rejects.toThrow(
      new BadRequestException(
        'Estoque insuficiente para o produto "Mel Silvestre".',
      ),
    );

    expect(pedidoShippingService.prepararFrete).not.toHaveBeenCalled();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deve impedir o pedido se o estoque mudar durante a transação', async () => {
    const cliente = {
      id: 1,
      zipCode: '62300-000',
      street: 'Rua Principal',
      addressNumber: '123',
      complement: null,
      neighborhood: 'Centro',
      city: 'Viçosa do Ceará',
      state: 'CE',
    };

    prisma.cliente.findUnique.mockResolvedValue(cliente);

    prisma.produto.findMany.mockResolvedValue([
      {
        id: 10,
        name: 'Mel Silvestre',
        active: true,
        stockQuantity: 10,
        price: new Prisma.Decimal('25.00'),
      },
    ]);

    const tx = {
      produto: {
        updateMany: jest.fn().mockResolvedValue({
          count: 0,
        }),
      },

      pedido: {
        create: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    const dto = {
      items: [
        {
          produtoId: 10,
          quantity: 2,
        },
      ],
      shippingServiceId: '1',
    };

    await expect(service.create(1, dto)).rejects.toThrow(
      new BadRequestException(
        'O estoque do produto "Mel Silvestre" foi alterado. Verifique a quantidade disponível e tente novamente.',
      ),
    );

    expect(pedidoShippingService.prepararFrete).toHaveBeenCalledWith(
      cliente,
      dto,
    );

    expect(tx.produto.updateMany).toHaveBeenCalledWith({
      where: {
        id: 10,
        active: true,
        stockQuantity: {
          gte: 2,
        },
      },

      data: {
        stockQuantity: {
          decrement: 2,
        },
      },
    });

    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it('deve rejeitar uma transição de status não permitida', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.ENVIADO,
      items: [
        {
          produtoId: 10,
          quantity: 1,
        },
      ],
    });

    await expect(
      service.updateStatus(1, {
        status: StatusPedido.CANCELADO,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Não é permitido alterar o pedido de ENVIADO para CANCELADO.',
      ),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deve impedir atualização quando o status mudar por outra operação', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      items: [
        {
          produtoId: 10,
          quantity: 2,
        },
      ],
    });

    const tx = {
      pedido: {
        updateMany: jest.fn().mockResolvedValue({
          count: 0,
        }),

        findUnique: jest.fn(),
      },

      produto: {
        update: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    await expect(
      service.updateStatus(1, {
        status: StatusPedido.CANCELADO,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'O status deste pedido foi alterado por outra operação. Atualize a página e tente novamente.',
      ),
    );

    expect(tx.produto.update).not.toHaveBeenCalled();

    expect(tx.pedido.findUnique).not.toHaveBeenCalled();
  });

  it('deve devolver o estoque exatamente uma vez ao cancelar o pedido', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      items: [
        {
          produtoId: 10,
          quantity: 2,
        },
        {
          produtoId: 11,
          quantity: 1,
        },
      ],
    });

    const pedidoAtualizado = {
      id: 1,
      status: StatusPedido.CANCELADO,

      totalPrice: new Prisma.Decimal('75.00'),

      shippingPrice: new Prisma.Decimal('0.00'),

      shippingServiceId: null,
      shippingServiceName: null,
      shippingCompanyName: null,
      shippingDeliveryTime: null,

      shippingZipCode: null,
      shippingStreet: null,
      shippingAddressNumber: null,
      shippingComplement: null,
      shippingNeighborhood: null,
      shippingCity: null,
      shippingState: null,

      clienteId: 1,

      cliente: {
        id: 1,
        name: 'Cliente Teste',
        email: 'cliente@teste.com',
      },

      items: [
        {
          id: 1,
          produtoId: 10,
          quantity: 2,

          unitPrice: new Prisma.Decimal('25.00'),

          subtotal: new Prisma.Decimal('50.00'),

          produto: {
            id: 10,
            name: 'Mel Silvestre',
            imageUrl: null,
          },
        },

        {
          id: 2,
          produtoId: 11,
          quantity: 1,

          unitPrice: new Prisma.Decimal('25.00'),

          subtotal: new Prisma.Decimal('25.00'),

          produto: {
            id: 11,
            name: 'Mel Florada',
            imageUrl: null,
          },
        },
      ],

      createdAt: new Date('2026-08-11T12:00:00.000Z'),

      updatedAt: new Date('2026-08-11T13:00:00.000Z'),
    };

    const tx = {
      pedido: {
        updateMany: jest.fn().mockResolvedValue({
          count: 1,
        }),

        findUnique: jest.fn().mockResolvedValue(pedidoAtualizado),
      },

      produto: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    const result = await service.updateStatus(1, {
      status: StatusPedido.CANCELADO,
    });

    expect(tx.pedido.updateMany).toHaveBeenCalledTimes(1);

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        status: StatusPedido.PAGO,
      },

      data: {
        status: StatusPedido.CANCELADO,
      },
    });

    expect(tx.produto.update).toHaveBeenCalledTimes(2);

    expect(tx.produto.update).toHaveBeenNthCalledWith(1, {
      where: {
        id: 10,
      },

      data: {
        stockQuantity: {
          increment: 2,
        },
      },
    });

    expect(tx.produto.update).toHaveBeenNthCalledWith(2, {
      where: {
        id: 11,
      },

      data: {
        stockQuantity: {
          increment: 1,
        },
      },
    });

    expect(result.status).toBe(StatusPedido.CANCELADO);

    expect(result.totalPrice).toBe(75);
  });
});
