import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { PatchProdutoDto } from './dto/patch-produto.dto';
import { ProdutoFilterDto } from './dto/produto-filter.dto';
import { PutProdutoDto } from './dto/put-produto.dto';

@Injectable()
export class ProdutosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: ProdutoFilterDto) {
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

    const produtos = await this.prisma.produto.findMany({
      where,
      orderBy: this.buildOrderBy(filter.sort),
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

    return produtos.map((produto) => this.toResponse(produto));
  }

  async findById(id: number) {
    const produto = await this.prisma.produto.findUnique({
      where: { id },
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

    return this.toResponse(produto);
  }

  async create(dto: CreateProdutoDto) {
    const name = dto.name.trim();

    await this.ensureNameIsAvailable(name);
    await this.ensureCategoriaIsActive(dto.categoryId);

    const produto = await this.prisma.produto.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        price: new Prisma.Decimal(dto.price),
        stockQuantity: dto.stockQuantity,
        imageUrl: dto.imageUrl?.trim() || null,
        active: dto.active ?? true,
        categoryId: dto.categoryId,
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

    return this.toResponse(produto);
  }

  async update(id: number, dto: PutProdutoDto) {
    await this.ensureProdutoExists(id);

    const name = dto.name.trim();

    await this.ensureNameIsAvailable(name, id);
    await this.ensureCategoriaIsActive(dto.categoryId);

    const produto = await this.prisma.produto.update({
      where: { id },
      data: {
        name,
        description: dto.description?.trim() || null,
        price: new Prisma.Decimal(dto.price),
        stockQuantity: dto.stockQuantity,
        imageUrl: dto.imageUrl?.trim() || null,
        active: dto.active,
        categoryId: dto.categoryId,
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

    return this.toResponse(produto);
  }

  async partialUpdate(id: number, dto: PatchProdutoDto) {
    await this.ensureProdutoExists(id);

    const data: Prisma.ProdutoUpdateInput = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      await this.ensureNameIsAvailable(name, id);

      data.name = name;
    }

    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }

    if (dto.price !== undefined) {
      data.price = new Prisma.Decimal(dto.price);
    }

    if (dto.stockQuantity !== undefined) {
      data.stockQuantity = dto.stockQuantity;
    }

    if (dto.imageUrl !== undefined) {
      data.imageUrl = dto.imageUrl.trim() || null;
    }

    if (dto.active !== undefined) {
      data.active = dto.active;
    }

    if (dto.categoryId !== undefined) {
      await this.ensureCategoriaIsActive(dto.categoryId);

      data.category = {
        connect: {
          id: dto.categoryId,
        },
      };
    }

    const produto = await this.prisma.produto.update({
      where: { id },
      data,
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

    return this.toResponse(produto);
  }

  async delete(id: number) {
    await this.ensureProdutoExists(id);

    await this.prisma.produto.delete({
      where: { id },
    });
  }

  private buildOrderBy(sort?: string): Prisma.ProdutoOrderByWithRelationInput {
    if (!sort) {
      return { id: 'asc' };
    }

    const [field, direction] = sort.split(',');

    if (
      (field === 'price' || field === 'name' || field === 'id') &&
      (direction === 'asc' || direction === 'desc')
    ) {
      return {
        [field]: direction,
      };
    }

    return { id: 'asc' };
  }

  private async ensureProdutoExists(id: number) {
    const produto = await this.prisma.produto.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!produto) {
      throw new NotFoundException('Produto não encontrado.');
    }
  }

  private async ensureNameIsAvailable(name: string, ignoreProdutoId?: number) {
    const produto = await this.prisma.produto.findFirst({
      where: {
        name,
        NOT: ignoreProdutoId ? { id: ignoreProdutoId } : undefined,
      },
      select: { id: true },
    });

    if (produto) {
      throw new ConflictException('Já existe um produto com esse nome.');
    }
  }

  private async ensureCategoriaIsActive(categoryId: number) {
    const categoria = await this.prisma.categoria.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        active: true,
      },
    });

    if (!categoria) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    if (!categoria.active) {
      throw new ConflictException(
        'Não é possível vincular produto a uma categoria inativa.',
      );
    }
  }

  private toResponse(
    produto: Prisma.ProdutoGetPayload<{
      include: {
        category: {
          select: {
            id: true;
            name: true;
          };
        };
        avaliacoes: {
          select: {
            rating: true;
          };
        };
      };
    }>,
  ) {
    const reviewsCount = produto.avaliacoes.length;

    const averageRating =
      reviewsCount > 0
        ? produto.avaliacoes.reduce(
            (sum, avaliacao) => sum + avaliacao.rating,
            0,
          ) / reviewsCount
        : null;

    return {
      id: produto.id,
      name: produto.name,
      description: produto.description,
      price: Number(produto.price),
      stockQuantity: produto.stockQuantity,
      imageUrl: produto.imageUrl,
      active: produto.active,
      category: produto.category,
      averageRating,
      reviewsCount,
      createdAt: produto.createdAt,
      updatedAt: produto.updatedAt,
    };
  }
}