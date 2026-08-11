import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CategoriasService } from './categorias.service';

describe('CategoriasService', () => {
  let service: CategoriasService;

  let prisma: {
    categoria: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    produto: {
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      categoria: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },

      produto: {
        updateMany: jest.fn(),
      },

      $transaction: jest.fn(),
    };

    service = new CategoriasService(
      prisma as unknown as PrismaService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve impedir criação de categoria com nome já existente', async () => {
    prisma.categoria.findFirst.mockResolvedValue({
      id: 1,
    });

    await expect(
      service.create({
        name: 'Mel Puro',
        description: 'Categoria teste',
        active: true,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'Já existe uma categoria com esse nome.',
      ),
    );

    expect(
      prisma.categoria.create,
    ).not.toHaveBeenCalled();
  });

  it('deve desativar a categoria e seus produtos ativos ao desativar por PATCH', async () => {
    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
    });

    const tx = {
      categoria: {
        update: jest
          .fn()
          .mockResolvedValue({
            id: 1,
            name: 'Mel Puro',
            active: false,
          }),
      },
      produto: {
        updateMany: jest
          .fn()
          .mockResolvedValue({
            count: 2,
          }),
      },
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (
          transaction: typeof tx,
        ) => unknown,
      ) => callback(tx),
    );

    const result =
      await service.partialUpdate(
        1,
        {
          active: false,
        },
      );

    expect(
      tx.categoria.update,
    ).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      data: {
        active: false,
      },
    });

    expect(
      tx.produto.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        categoryId: 1,
        active: true,
      },
      data: {
        active: false,
      },
    });

    expect(result.active).toBe(false);
  });

  it('deve desativar categoria com produtos vinculados em vez de excluir', async () => {
    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
      _count: {
        produtos: 3,
      },
    });

    prisma.$transaction.mockResolvedValue([
      {
        id: 1,
        active: false,
      },
      {
        count: 2,
      },
    ]);

    await service.delete(1);

    expect(
      prisma.$transaction,
    ).toHaveBeenCalledTimes(1);

    expect(
      prisma.categoria.update,
    ).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      data: {
        active: false,
      },
    });

    expect(
      prisma.produto.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        categoryId: 1,
        active: true,
      },
      data: {
        active: false,
      },
    });

    expect(
      prisma.categoria.delete,
    ).not.toHaveBeenCalled();
  });

  it('deve excluir definitivamente categoria sem produtos vinculados', async () => {
    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
      _count: {
        produtos: 0,
      },
    });

    prisma.categoria.delete.mockResolvedValue({
      id: 1,
    });

    await service.delete(1);

    expect(
      prisma.categoria.delete,
    ).toHaveBeenCalledTimes(1);

    expect(
      prisma.categoria.delete,
    ).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
    });

    expect(
      prisma.$transaction,
    ).not.toHaveBeenCalled();
  });

  it('deve rejeitar exclusão de categoria inexistente', async () => {
    prisma.categoria.findUnique.mockResolvedValue(
      null,
    );

    await expect(
      service.delete(999),
    ).rejects.toThrow(
      new NotFoundException(
        'Categoria não encontrada.',
      ),
    );

    expect(
      prisma.categoria.delete,
    ).not.toHaveBeenCalled();

    expect(
      prisma.$transaction,
    ).not.toHaveBeenCalled();
  });

  it('deve rejeitar atualização de categoria inexistente', async () => {
    prisma.categoria.findUnique.mockResolvedValue(
      null,
    );

    await expect(
      service.partialUpdate(
        999,
        {
          active: false,
        },
      ),
    ).rejects.toThrow(
      new NotFoundException(
        'Categoria não encontrada.',
      ),
    );

    expect(
      prisma.categoria.update,
    ).not.toHaveBeenCalled();

    expect(
      prisma.$transaction,
    ).not.toHaveBeenCalled();
  });
});