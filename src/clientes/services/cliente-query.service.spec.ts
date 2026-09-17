import { NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ClienteQueryService } from './cliente-query.service';

describe('ClienteQueryService', () => {
  let service: ClienteQueryService;

  let prisma: {
    cliente: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const getFindManyArgs = (): Prisma.ClienteFindManyArgs => {
    const calls = prisma.cliente.findMany.mock.calls as unknown as Array<
      [Prisma.ClienteFindManyArgs]
    >;

    const firstCall = calls[0];

    if (!firstCall) {
      throw new Error('cliente.findMany não foi chamado.');
    }

    return firstCall[0];
  };

  const getCountArgs = (): Prisma.ClienteCountArgs => {
    const calls = prisma.cliente.count.mock.calls as unknown as Array<
      [Prisma.ClienteCountArgs]
    >;

    const firstCall = calls[0];

    if (!firstCall) {
      throw new Error('cliente.count não foi chamado.');
    }

    return firstCall[0];
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      cliente: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    service = new ClienteQueryService(prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve aplicar busca, filtros e paginação na listagem', async () => {
    prisma.cliente.findMany.mockResolvedValue([]);
    prisma.cliente.count.mockResolvedValue(0);

    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    const result = await service.findAll({
      page: 2,
      limit: 5,
      search: 'Fortaleza',
      role: Role.CLIENTE,
      active: true,
    });

    const findManyArgs = getFindManyArgs();
    const countArgs = getCountArgs();

    expect(findManyArgs.skip).toBe(5);
    expect(findManyArgs.take).toBe(5);
    expect(findManyArgs.orderBy).toEqual({
      id: 'asc',
    });

    expect(findManyArgs.where).toMatchObject({
      role: Role.CLIENTE,
      active: true,
    });

    expect(findManyArgs.where?.OR).toContainEqual({
      city: {
        contains: 'Fortaleza',
        mode: 'insensitive',
      },
    });

    expect(countArgs.where).toEqual(findManyArgs.where);

    expect(result).toEqual({
      content: [],
      pagination: {
        page: 2,
        limit: 5,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });

  it('deve calcular corretamente a paginação', async () => {
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 6,
        name: 'Cliente 6',
      },
    ]);
    prisma.cliente.count.mockResolvedValue(11);

    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    const result = await service.findAll({
      page: 2,
      limit: 5,
    });

    expect(result.pagination).toEqual({
      page: 2,
      limit: 5,
      totalItems: 11,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('deve buscar cliente por id', async () => {
    const cliente = {
      id: 10,
      name: 'Cliente Teste',
      email: 'cliente@teste.com',
      role: Role.CLIENTE,
      active: true,
      phone: null,
      street: null,
      addressNumber: null,
      complement: null,
      neighborhood: null,
      city: 'Fortaleza',
      state: 'CE',
      zipCode: null,
      createdAt: new Date('2026-09-17T12:00:00.000Z'),
      updatedAt: new Date('2026-09-17T12:00:00.000Z'),
    };

    prisma.cliente.findUnique.mockResolvedValue(cliente);

    await expect(service.findById(10)).resolves.toEqual(cliente);

    expect(prisma.cliente.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 10,
        },
      }),
    );
  });

  it('deve lançar NotFoundException quando o cliente não existir', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);

    await expect(service.findById(999)).rejects.toThrow(
      new NotFoundException('Cliente não encontrado.'),
    );
  });

  it('findMe deve reutilizar a consulta por id', async () => {
    const cliente = {
      id: 7,
      name: 'Cliente Teste',
    };

    prisma.cliente.findUnique.mockResolvedValue(cliente);

    await expect(service.findMe(7)).resolves.toEqual(cliente);

    expect(prisma.cliente.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.cliente.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 7,
        },
      }),
    );
  });
});
