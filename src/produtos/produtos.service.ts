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
import { ProdutoImageService } from './produto-image.service';
import {
  buildProdutoOrderBy,
  buildProdutoShippingData,
  buildProdutoShippingPatch,
  toProdutoResponse,
} from './produto.utils';

@Injectable()
export class ProdutosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly produtoImageService: ProdutoImageService,
  ) {}

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

  async create(dto: CreateProdutoDto) {
    const imagePublicId = dto.imagePublicId?.trim() || null;

    try {
      const name = dto.name.trim();

      await this.ensureNameIsAvailable(name);

      await this.ensureCategoriaIsActive(dto.categoryId);

      const shippingData = buildProdutoShippingData(dto);

      const produto = await this.prisma.produto.create({
        data: {
          name,
          description: dto.description?.trim() || null,
          price: new Prisma.Decimal(dto.price),
          stockQuantity: dto.stockQuantity,
          imageUrl: dto.imageUrl?.trim() || null,
          imagePublicId,
          ...shippingData,
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

      return toProdutoResponse(produto);
    } catch (error) {
      await this.produtoImageService.cleanupOrphanImage(imagePublicId);

      throw error;
    }
  }

  async update(id: number, dto: PutProdutoDto) {
    const novoImagePublicId = dto.imagePublicId?.trim() || null;

    try {
      const produtoAtual = await this.ensureProdutoExists(id);

      const name = dto.name.trim();

      await this.ensureNameIsAvailable(name, id);

      await this.ensureCategoriaIsActive(dto.categoryId);

      const shippingData = buildProdutoShippingData(dto);

      const produto = await this.prisma.produto.update({
        where: {
          id,
        },
        data: {
          name,
          description: dto.description?.trim() || null,
          price: new Prisma.Decimal(dto.price),
          stockQuantity: dto.stockQuantity,
          imageUrl: dto.imageUrl?.trim() || null,
          imagePublicId: novoImagePublicId,
          ...shippingData,
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

      await this.produtoImageService.cleanupReplacedImage(
        produtoAtual.imagePublicId,
        novoImagePublicId,
      );

      return toProdutoResponse(produto);
    } catch (error) {
      await this.produtoImageService.cleanupOrphanImage(novoImagePublicId);

      throw error;
    }
  }

  async partialUpdate(id: number, dto: PatchProdutoDto) {
    const candidateImagePublicId = dto.imagePublicId?.trim() || null;

    try {
      const produtoAtual = await this.ensureProdutoExists(id);

      const data: Prisma.ProdutoUpdateInput = {};

      let novoImagePublicId = produtoAtual.imagePublicId;

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

        novoImagePublicId = dto.imagePublicId?.trim() || null;

        data.imagePublicId = novoImagePublicId;
      } else if (dto.imagePublicId !== undefined) {
        novoImagePublicId = dto.imagePublicId.trim() || null;

        data.imagePublicId = novoImagePublicId;
      }

      Object.assign(data, buildProdutoShippingPatch(dto));

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
        where: {
          id,
        },
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

      await this.produtoImageService.cleanupReplacedImage(
        produtoAtual.imagePublicId,
        novoImagePublicId,
      );

      return toProdutoResponse(produto);
    } catch (error) {
      await this.produtoImageService.cleanupOrphanImage(candidateImagePublicId);

      throw error;
    }
  }

  async delete(id: number): Promise<void> {
    const produto = await this.prisma.produto.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        imagePublicId: true,
        _count: {
          select: {
            pedidoItems: true,
          },
        },
      },
    });

    if (!produto) {
      throw new NotFoundException('Produto não encontrado.');
    }

    if (produto._count.pedidoItems > 0) {
      await this.deactivateProduto(id);

      return;
    }

    try {
      await this.prisma.produto.delete({
        where: {
          id,
        },
      });

      await this.produtoImageService.cleanupImage(produto.imagePublicId);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        await this.deactivateProduto(id);

        return;
      }

      throw error;
    }
  }

  private async ensureProdutoExists(id: number) {
    const produto = await this.prisma.produto.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        imagePublicId: true,
      },
    });

    if (!produto) {
      throw new NotFoundException('Produto não encontrado.');
    }

    return produto;
  }

  private async ensureNameIsAvailable(name: string, ignoreProdutoId?: number) {
    const produto = await this.prisma.produto.findFirst({
      where: {
        name,
        NOT:
          ignoreProdutoId !== undefined
            ? {
                id: ignoreProdutoId,
              }
            : undefined,
      },
      select: {
        id: true,
      },
    });

    if (produto) {
      throw new ConflictException('Já existe um produto com esse nome.');
    }
  }

  private async ensureCategoriaIsActive(categoryId: number) {
    const categoria = await this.prisma.categoria.findUnique({
      where: {
        id: categoryId,
      },
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

  private async deactivateProduto(id: number): Promise<void> {
    await this.prisma.produto.update({
      where: {
        id,
      },
      data: {
        active: false,
      },
    });
  }
}
