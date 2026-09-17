import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { PedidoQueryService } from './pedido-query.service';

describe('PedidoQueryService', () => {
  let service: PedidoQueryService;

  let prisma: {
    pedido: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const getFindManyArgs = (): Prisma.PedidoFindManyArgs => {
    const calls = prisma.pedido.findMany.mock.calls as unknown as Array<
      [Prisma.PedidoFindManyArgs]
    >;

    const firstCall = calls[0];

    if (!firstCall) {
      throw new Error('findMany não foi chamado.');
    }

    return firstCall[0];
  };

  const getCountArgs = (): Prisma.PedidoCountArgs => {
    const calls = prisma.pedido.count.mock.calls as unknown as Array<
      [Prisma.PedidoCountArgs]
    >;

    const firstCall = calls[0];

    if (!firstCall) {
      throw new Error('count não foi chamado.');
    }

    return firstCall[0];
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      pedido: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },

      $transaction: jest.fn(),
    };

    service = new PedidoQueryService(prisma as unknown as PrismaService);
  });

  it('deve buscar pedidos por dados do frete e do endereço', async () => {
    prisma.pedido.findMany.mockResolvedValue([]);
    prisma.pedido.count.mockResolvedValue(0);

    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    await service.findAll({
      page: 1,
      limit: 10,
      search: 'Correios',
    });

    expect(prisma.pedido.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.pedido.count).toHaveBeenCalledTimes(1);

    const findManyArgs = getFindManyArgs();
    const countArgs = getCountArgs();

    expect(findManyArgs.skip).toBe(0);
    expect(findManyArgs.take).toBe(10);

    expect(findManyArgs.orderBy).toEqual({
      createdAt: 'desc',
    });

    const findManyOr = findManyArgs.where?.OR;

    expect(findManyOr).toContainEqual({
      shippingCompanyName: {
        contains: 'Correios',
        mode: 'insensitive',
      },
    });

    expect(findManyOr).toContainEqual({
      shippingServiceName: {
        contains: 'Correios',
        mode: 'insensitive',
      },
    });

    expect(findManyOr).toContainEqual({
      shippingStreet: {
        contains: 'Correios',
        mode: 'insensitive',
      },
    });

    expect(findManyOr).toContainEqual({
      shippingAddressNumber: {
        contains: 'Correios',
        mode: 'insensitive',
      },
    });

    expect(findManyOr).toContainEqual({
      shippingComplement: {
        contains: 'Correios',
        mode: 'insensitive',
      },
    });

    expect(findManyOr).toContainEqual({
      shippingNeighborhood: {
        contains: 'Correios',
        mode: 'insensitive',
      },
    });

    expect(findManyOr).toContainEqual({
      shippingCity: {
        contains: 'Correios',
        mode: 'insensitive',
      },
    });

    expect(findManyOr).toContainEqual({
      shippingState: {
        contains: 'Correios',
        mode: 'insensitive',
      },
    });

    expect(findManyOr).toContainEqual({
      items: {
        some: {
          produto: {
            name: {
              contains: 'Correios',
              mode: 'insensitive',
            },
          },
        },
      },
    });

    const countOr = countArgs.where?.OR;

    expect(countOr).toContainEqual({
      shippingCompanyName: {
        contains: 'Correios',
        mode: 'insensitive',
      },
    });
  });

  it('deve normalizar CEP formatado na busca administrativa', async () => {
    prisma.pedido.findMany.mockResolvedValue([]);
    prisma.pedido.count.mockResolvedValue(0);

    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    await service.findAll({
      page: 1,
      limit: 10,
      search: '62300-000',
    });

    const findManyArgs = getFindManyArgs();

    expect(findManyArgs.where?.OR).toContainEqual({
      shippingZipCode: {
        contains: '62300000',
      },
    });
  });

  it('deve continuar permitindo busca pelo ID numérico do pedido', async () => {
    prisma.pedido.findMany.mockResolvedValue([]);
    prisma.pedido.count.mockResolvedValue(0);

    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    await service.findAll({
      page: 1,
      limit: 10,
      search: '123',
    });

    const findManyArgs = getFindManyArgs();

    expect(findManyArgs.where?.OR).toContainEqual({
      id: 123,
    });
  });
});
