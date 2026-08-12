import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { PatchProdutoDto } from './dto/patch-produto.dto';
import { ProdutoFilterDto } from './dto/produto-filter.dto';
import { PutProdutoDto } from './dto/put-produto.dto';

@Injectable()
export class ProdutosService {
  private readonly logger = new Logger(
    ProdutosService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async findAllPublic(
    filter: ProdutoFilterDto,
  ) {
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

    const produtos =
      await this.prisma.produto.findMany({
        where,
        orderBy: this.buildOrderBy(
          filter.sort,
        ),
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

    return produtos.map((produto) =>
      this.toResponse(produto),
    );
  }

  async findAllAdmin(
    filter: ProdutoFilterDto,
  ) {
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

    const [produtos, totalItems] =
      await this.prisma.$transaction([
        this.prisma.produto.findMany({
          where,
          skip,
          take: limit,
          orderBy: this.buildOrderBy(
            filter.sort,
          ),
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

    const totalPages = Math.max(
      1,
      Math.ceil(totalItems / limit),
    );

    return {
      content: produtos.map((produto) =>
        this.toResponse(produto),
      ),
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
    const produto =
      await this.prisma.produto.findFirst({
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
      throw new NotFoundException(
        'Produto não encontrado.',
      );
    }

    return this.toResponse(produto);
  }

  async findByIdAdmin(id: number) {
    const produto =
      await this.prisma.produto.findUnique({
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
      throw new NotFoundException(
        'Produto não encontrado.',
      );
    }

    return this.toResponse(produto);
  }

  async create(dto: CreateProdutoDto) {
    const name = dto.name.trim();

    await this.ensureNameIsAvailable(name);

    await this.ensureCategoriaIsActive(
      dto.categoryId,
    );

    const produto =
      await this.prisma.produto.create({
        data: {
          name,
          description:
            dto.description?.trim() || null,
          price: new Prisma.Decimal(
            dto.price,
          ),
          stockQuantity:
            dto.stockQuantity,
          imageUrl:
            dto.imageUrl?.trim() || null,
          imagePublicId:
            dto.imagePublicId?.trim() ||
            null,
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

  async update(
    id: number,
    dto: PutProdutoDto,
  ) {
    const produtoAtual =
      await this.ensureProdutoExists(id);

    const name = dto.name.trim();

    await this.ensureNameIsAvailable(
      name,
      id,
    );

    await this.ensureCategoriaIsActive(
      dto.categoryId,
    );

    const novoImagePublicId =
      dto.imagePublicId?.trim() || null;

    const produto =
      await this.prisma.produto.update({
        where: {
          id,
        },
        data: {
          name,
          description:
            dto.description?.trim() || null,
          price: new Prisma.Decimal(
            dto.price,
          ),
          stockQuantity:
            dto.stockQuantity,
          imageUrl:
            dto.imageUrl?.trim() || null,
          imagePublicId:
            novoImagePublicId,
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

    await this.cleanupReplacedImage(
      produtoAtual.imagePublicId,
      novoImagePublicId,
    );

    return this.toResponse(produto);
  }

  async partialUpdate(
    id: number,
    dto: PatchProdutoDto,
  ) {
    const produtoAtual =
      await this.ensureProdutoExists(id);

    const data: Prisma.ProdutoUpdateInput =
      {};

    let novoImagePublicId =
      produtoAtual.imagePublicId;

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      await this.ensureNameIsAvailable(
        name,
        id,
      );

      data.name = name;
    }

    if (dto.description !== undefined) {
      data.description =
        dto.description.trim() || null;
    }

    if (dto.price !== undefined) {
      data.price = new Prisma.Decimal(
        dto.price,
      );
    }

    if (dto.stockQuantity !== undefined) {
      data.stockQuantity =
        dto.stockQuantity;
    }

    if (dto.imageUrl !== undefined) {
      data.imageUrl =
        dto.imageUrl.trim() || null;

      novoImagePublicId =
        dto.imagePublicId?.trim() ||
        null;

      data.imagePublicId =
        novoImagePublicId;
    } else if (
      dto.imagePublicId !== undefined
    ) {
      novoImagePublicId =
        dto.imagePublicId.trim() ||
        null;

      data.imagePublicId =
        novoImagePublicId;
    }

    if (dto.active !== undefined) {
      data.active = dto.active;
    }

    if (dto.categoryId !== undefined) {
      await this.ensureCategoriaIsActive(
        dto.categoryId,
      );

      data.category = {
        connect: {
          id: dto.categoryId,
        },
      };
    }

    const produto =
      await this.prisma.produto.update({
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

    await this.cleanupReplacedImage(
      produtoAtual.imagePublicId,
      novoImagePublicId,
    );

    return this.toResponse(produto);
  }

  async delete(id: number): Promise<void> {
    const produto =
      await this.prisma.produto.findUnique({
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
      throw new NotFoundException(
        'Produto não encontrado.',
      );
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

      await this.cleanupImage(
        produto.imagePublicId,
      );
    } catch (error) {
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        await this.deactivateProduto(id);
        return;
      }

      throw error;
    }
  }

  private buildOrderBy(
    sort?: string,
  ): Prisma.ProdutoOrderByWithRelationInput {
    if (!sort) {
      return {
        id: 'asc',
      };
    }

    const [field, direction] =
      sort.split(',');

    if (
      (field === 'price' ||
        field === 'name' ||
        field === 'id') &&
      (direction === 'asc' ||
        direction === 'desc')
    ) {
      return {
        [field]: direction,
      };
    }

    return {
      id: 'asc',
    };
  }

  private async ensureProdutoExists(
    id: number,
  ) {
    const produto =
      await this.prisma.produto.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          imagePublicId: true,
        },
      });

    if (!produto) {
      throw new NotFoundException(
        'Produto não encontrado.',
      );
    }

    return produto;
  }

  private async ensureNameIsAvailable(
    name: string,
    ignoreProdutoId?: number,
  ) {
    const produto =
      await this.prisma.produto.findFirst({
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
      throw new ConflictException(
        'Já existe um produto com esse nome.',
      );
    }
  }

  private async ensureCategoriaIsActive(
    categoryId: number,
  ) {
    const categoria =
      await this.prisma.categoria.findUnique({
        where: {
          id: categoryId,
        },
        select: {
          id: true,
          active: true,
        },
      });

    if (!categoria) {
      throw new NotFoundException(
        'Categoria não encontrada.',
      );
    }

    if (!categoria.active) {
      throw new ConflictException(
        'Não é possível vincular produto a uma categoria inativa.',
      );
    }
  }

  private async deactivateProduto(
    id: number,
  ): Promise<void> {
    await this.prisma.produto.update({
      where: {
        id,
      },
      data: {
        active: false,
      },
    });
  }

  private async cleanupReplacedImage(
    oldPublicId: string | null,
    newPublicId: string | null,
  ): Promise<void> {
    if (
      !oldPublicId ||
      oldPublicId === newPublicId
    ) {
      return;
    }

    await this.cleanupImage(
      oldPublicId,
    );
  }

  private async cleanupImage(
    publicId: string | null,
  ): Promise<void> {
    if (!publicId) {
      return;
    }

    try {
      await this.cloudinaryService.deleteImage(
        publicId,
      );
    } catch (error) {
      this.logger.warn(
        `Não foi possível remover a imagem "${publicId}" da Cloudinary.`,
        error instanceof Error
          ? error.message
          : undefined,
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
    const reviewsCount =
      produto.avaliacoes.length;

    const averageRating =
      reviewsCount > 0
        ? produto.avaliacoes.reduce(
            (sum, avaliacao) =>
              sum + avaliacao.rating,
            0,
          ) / reviewsCount
        : null;

    return {
      id: produto.id,
      name: produto.name,
      description:
        produto.description,
      price: Number(produto.price),
      stockQuantity:
        produto.stockQuantity,
      imageUrl: produto.imageUrl,
      imagePublicId:
        produto.imagePublicId,
      active: produto.active,
      category: produto.category,
      averageRating,
      reviewsCount,
      createdAt:
        produto.createdAt,
      updatedAt:
        produto.updatedAt,
    };
  }
}