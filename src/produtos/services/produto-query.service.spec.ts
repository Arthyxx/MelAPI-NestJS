import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ProdutoQueryService } from './produto-query.service';

describe('ProdutoQueryService', () => {
  let service: ProdutoQueryService;

  let prisma: {
    produto: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const criarProduto = () => ({
    id: 10,
    name: 'Mel Teste',
    description: null,
    price: new Prisma.Decimal('40.00'),
    stockQuantity: 10,
    imageUrl: null,
    imagePublicId: null,
    weightKg: null,
    heightCm: null,
    widthCm: null,
    lengthCm: null,
    active: true,
    createdAt: new Date('2026-09-15T12:00:00.000Z'),
    updatedAt: new Date('2026-09-15T12:00:00.000Z'),
    categoryId: 1,
    category: {
      id: 1,
      name: 'Mel',
    },
    avaliacoes: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      produto: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    service = new ProdutoQueryService(prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve listar publicamente apenas produtos ativos de categorias ativas', async () => {
    prisma.produto.findMany.mockResolvedValue([]);

    const result = await service.findAllPublic({ page: 1, limit: 10 });

    expect(result).toEqual([]);

    expect(prisma.produto.findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        category: {
          active: true,
        },
      },
      orderBy: {
        id: 'asc',
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        avaliacoes: {
          select: {
            rating: true,
          },
        },
      },
    });
  });

  it('deve aplicar filtros na listagem pública', async () => {
    prisma.produto.findMany.mockResolvedValue([]);

    await service.findAllPublic({
      page: 1,
      limit: 10,
      name: '  Mel  ',
      categoryId: 2,
    });

    expect(prisma.produto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          active: true,
          category: {
            active: true,
          },
          name: {
            contains: 'Mel',
            mode: 'insensitive',
          },
          categoryId: 2,
        },
      }),
    );
  });

  it('deve paginar e filtrar a listagem administrativa', async () => {
    prisma.produto.findMany.mockResolvedValue([]);
    prisma.produto.count.mockResolvedValue(11);

    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    const result = await service.findAllAdmin({
      page: 2,
      limit: 5,
      name: 'Mel',
      categoryId: 1,
      active: false,
    });

    expect(prisma.produto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name: {
            contains: 'Mel',
            mode: 'insensitive',
          },
          categoryId: 1,
          active: false,
        },
        skip: 5,
        take: 5,
      }),
    );

    expect(result.pagination).toEqual({
      page: 2,
      limit: 5,
      totalItems: 11,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('deve buscar produto público somente quando produto e categoria estiverem ativos', async () => {
    const produto = criarProduto();

    prisma.produto.findFirst.mockResolvedValue(produto);

    const result = await service.findByIdPublic(10);

    expect(prisma.produto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 10,
          active: true,
          category: {
            active: true,
          },
        },
      }),
    );

    expect(result.id).toBe(10);
    expect(result.name).toBe('Mel Teste');
  });

  it('deve lançar NotFoundException quando produto público não existir', async () => {
    prisma.produto.findFirst.mockResolvedValue(null);

    await expect(service.findByIdPublic(999)).rejects.toThrow(
      new NotFoundException('Produto não encontrado.'),
    );
  });

  it('deve buscar produto por id no admin mesmo que esteja inativo', async () => {
    const produto = {
      ...criarProduto(),
      active: false,
    };

    prisma.produto.findUnique.mockResolvedValue(produto);

    const result = await service.findByIdAdmin(10);

    expect(prisma.produto.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 10,
        },
      }),
    );

    expect(result.id).toBe(10);
    expect(result.active).toBe(false);
  });

  it('deve lançar NotFoundException quando produto admin não existir', async () => {
    prisma.produto.findUnique.mockResolvedValue(null);

    await expect(service.findByIdAdmin(999)).rejects.toThrow(
      new NotFoundException('Produto não encontrado.'),
    );
  });
});
