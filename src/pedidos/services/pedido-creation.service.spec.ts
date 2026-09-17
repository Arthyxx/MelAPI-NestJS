import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { PedidoShippingService } from '../pedido-shipping.service';
import { PedidoCreationService } from './pedido-creation.service';

describe('PedidoCreationService', () => {
  let service: PedidoCreationService;

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

  const configService = {
    get: jest.fn(),
  };

  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440001';

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

    configService.get.mockImplementation((key: string) => {
      if (key === 'PENDING_ORDER_EXPIRATION_MINUTES') {
        return 30;
      }

      return undefined;
    });

    service = new PedidoCreationService(
      prisma as unknown as PrismaService,
      pedidoShippingService as unknown as PedidoShippingService,
      configService as unknown as ConfigService,
    );
  });

  it('deve rejeitar produto duplicado no mesmo pedido', async () => {
    prisma.pedido.findUnique.mockResolvedValue(null);
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
      quotedShippingPrice: 25.9,
      quotedZipCode: '62300000',
    };

    await expect(service.create(1, dto, idempotencyKey)).rejects.toThrow(
      new BadRequestException(
        'Não envie o mesmo produto mais de uma vez no pedido.',
      ),
    );

    expect(prisma.produto.findMany).not.toHaveBeenCalled();
    expect(pedidoShippingService.prepararFrete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deve rejeitar pedido quando o estoque inicial é insuficiente', async () => {
    prisma.pedido.findUnique.mockResolvedValue(null);
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
      quotedShippingPrice: 25.9,
      quotedZipCode: '62300000',
    };

    await expect(service.create(1, dto, idempotencyKey)).rejects.toThrow(
      new BadRequestException(
        'Estoque insuficiente para o produto "Mel Silvestre".',
      ),
    );

    expect(pedidoShippingService.prepararFrete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deve impedir o pedido se o estoque mudar durante a transação', async () => {
    prisma.pedido.findUnique.mockResolvedValue(null);

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
      quotedShippingPrice: 25.9,
      quotedZipCode: '62300000',
    };

    await expect(service.create(1, dto, idempotencyKey)).rejects.toThrow(
      new BadRequestException(
        'O estoque do produto "Mel Silvestre" foi alterado. Verifique a quantidade disponível e tente novamente.',
      ),
    );

    expect(configService.get).toHaveBeenCalledWith(
      'PENDING_ORDER_EXPIRATION_MINUTES',
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
});
