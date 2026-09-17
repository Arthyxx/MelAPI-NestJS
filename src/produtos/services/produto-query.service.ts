import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ProdutoFilterDto } from '../dto/produto-filter.dto';
import { buildProdutoOrderBy, toProdutoResponse } from '../produto.utils';

@Injectable()
export class ProdutoQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPublic(filter: ProdutoFilterDto) {
    const where: Prisma.ProdutoWhereInput = {
      active: true,
      category: {
        active: true,
      },
    };

    if (filter.name?.trim()) {
      where.name = {
        contains: filter.name.trim(),
        mode: 'insensitive',
      };
    }

    if (filter.categoryId !== undefined) {
      where.categoryId = filter.categoryId;
    }

    const produtos = await this.prisma.produto.findMany({
      where,
      orderBy: buildProdutoOrderBy(filter.sort),
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

    return produtos.map(toProdutoResponse);
  }

  async findAllAdmin(filter: ProdutoFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ProdutoWhereInput = {};

    if (filter.name?.trim()) {
      where.name = {
        contains: filter.name.trim(),
        mode: 'insensitive',
      };
    }

    if (filter.categoryId !== undefined) {
      where.categoryId = filter.categoryId;
    }

    if (filter.active !== undefined) {
      where.active = filter.active;
    }

    const [produtos, totalItems] = await this.prisma.$transaction([
      this.prisma.produto.findMany({
        where,
        skip,
        take: limit,
        orderBy: buildProdutoOrderBy(filter.sort),
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
      }),
      this.prisma.produto.count({
        where,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return {
      content: produtos.map(toProdutoResponse),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findByIdPublic(id: number) {
    const produto = await this.prisma.produto.findFirst({
      where: {
        id,
        active: true,
        category: {
          active: true,
        },
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

    if (!produto) {
      throw new NotFoundException('Produto não encontrado.');
    }

    return toProdutoResponse(produto);
  }

  async findByIdAdmin(id: number) {
    const produto = await this.prisma.produto.findUnique({
      where: {
        id,
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

    if (!produto) {
      throw new NotFoundException('Produto não encontrado.');
    }

    return toProdutoResponse(produto);
  }
}
