import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { PedidoShippingService } from './pedido-shipping.service';
import { PedidosService } from './pedidos.service';

interface PedidosServiceWithIdempotency {
  create(
    clienteId: number,
    dto: CreatePedidoDto,
    idempotencyKey: string,
  ): Promise<unknown>;
}

interface PedidosServiceInternals {
  toResponse(pedido: unknown): unknown;
}

describe('PedidosService - idempotência na criação', () => {
  let service: PedidosService;

  const pedidoShippingService = {
    prepararFrete: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  const prisma = {
    pedido: {
      findUnique: jest.fn(),
    },

    cliente: {
      findUnique: jest.fn(),
    },

    produto: {
      findMany: jest.fn(),
    },

    $transaction: jest.fn(),
  };

  const dto: CreatePedidoDto = {
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

  beforeEach(() => {
    jest.clearAllMocks();

    service = new PedidosService(
      prisma as unknown as PrismaService,
      pedidoShippingService as unknown as PedidoShippingService,
      configService as unknown as ConfigService,
    );
  });

  it('deve reutilizar pedido existente com a mesma chave sem reservar estoque novamente', async () => {
    const pedidoExistente = {
      id: 77,
      clienteId: 10,
      idempotencyKey,

      shippingServiceId: '1',
      shippingPrice: new Prisma.Decimal('12.50'),
      shippingZipCode: '60421410',

      items: [
        {
          produtoId: 5,
          quantity: 2,
        },
      ],
    };

    const responseExistente = {
      id: 77,
      status: 'PENDENTE',
    };

    prisma.pedido.findUnique.mockResolvedValue(pedidoExistente);

    const serviceInternals = service as unknown as PedidosServiceInternals;

    jest
      .spyOn(serviceInternals, 'toResponse')
      .mockReturnValue(responseExistente);

    const serviceWithIdempotency =
      service as unknown as PedidosServiceWithIdempotency;

    const result = await serviceWithIdempotency.create(10, dto, idempotencyKey);

    expect(prisma.pedido.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clienteId_idempotencyKey: {
            clienteId: 10,
            idempotencyKey,
          },
        },
      }),
    );

    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();

    expect(prisma.produto.findMany).not.toHaveBeenCalled();

    expect(pedidoShippingService.prepararFrete).not.toHaveBeenCalled();

    expect(prisma.$transaction).not.toHaveBeenCalled();

    expect(result).toEqual(responseExistente);
  });

  it('deve rejeitar reutilização da mesma chave com dados diferentes', async () => {
    const pedidoExistente = {
      id: 77,
      clienteId: 10,
      idempotencyKey,

      shippingServiceId: '1',
      shippingPrice: new Prisma.Decimal('12.50'),
      shippingZipCode: '60421410',

      items: [
        {
          produtoId: 5,
          quantity: 1,
        },
      ],
    };

    prisma.pedido.findUnique.mockResolvedValue(pedidoExistente);

    const serviceInternals = service as unknown as PedidosServiceInternals;

    jest.spyOn(serviceInternals, 'toResponse').mockReturnValue({
      id: 77,
      status: 'PENDENTE',
    });

    const serviceWithIdempotency =
      service as unknown as PedidosServiceWithIdempotency;

    await expect(
      serviceWithIdempotency.create(10, dto, idempotencyKey),
    ).rejects.toThrow(
      new ConflictException(
        'Esta chave de idempotência já foi usada com dados diferentes.',
      ),
    );

    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();

    expect(prisma.produto.findMany).not.toHaveBeenCalled();

    expect(pedidoShippingService.prepararFrete).not.toHaveBeenCalled();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deve reutilizar o pedido vencedor quando duas requisições com a mesma chave concorrerem', async () => {
    const pedidoVencedor = {
      id: 88,
      clienteId: 10,
      idempotencyKey,

      shippingServiceId: '1',
      shippingPrice: new Prisma.Decimal('12.50'),
      shippingZipCode: '60421410',

      items: [
        {
          produtoId: 5,
          quantity: 2,
        },
      ],
    };

    const responseVencedor = {
      id: 88,
      status: 'PENDENTE',
    };

    prisma.pedido.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pedidoVencedor);

    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      zipCode: '60421410',
      street: 'Rua Teste',
      addressNumber: '100',
      complement: null,
      neighborhood: 'Centro',
      city: 'Fortaleza',
      state: 'CE',
    });

    prisma.produto.findMany.mockResolvedValue([
      {
        id: 5,
        name: 'Mel Silvestre',
        active: true,
        stockQuantity: 10,
        price: new Prisma.Decimal('25.00'),
      },
    ]);

    pedidoShippingService.prepararFrete.mockResolvedValue({
      shippingPrice: 12.5,
      shippingServiceId: '1',
      shippingServiceName: 'PAC',
      shippingCompanyName: 'Correios',
      shippingDeliveryTime: 5,
      shippingZipCode: '60421410',
      shippingStreet: 'Rua Teste',
      shippingAddressNumber: '100',
      shippingComplement: null,
      shippingNeighborhood: 'Centro',
      shippingCity: 'Fortaleza',
      shippingState: 'CE',
    });

    configService.get.mockReturnValue(30);

    prisma.$transaction.mockRejectedValue({
      code: 'P2002',
    });

    const serviceInternals = service as unknown as PedidosServiceInternals;

    jest
      .spyOn(serviceInternals, 'toResponse')
      .mockReturnValue(responseVencedor);

    const serviceWithIdempotency =
      service as unknown as PedidosServiceWithIdempotency;

    const result = await serviceWithIdempotency.create(10, dto, idempotencyKey);

    expect(prisma.pedido.findUnique).toHaveBeenCalledTimes(2);

    expect(prisma.pedido.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          clienteId_idempotencyKey: {
            clienteId: 10,
            idempotencyKey,
          },
        },
      }),
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(result).toEqual(responseVencedor);
  });
});
