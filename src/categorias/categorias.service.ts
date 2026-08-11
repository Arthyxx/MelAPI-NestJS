import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriaFilterDto } from './dto/categoria-filter.dto';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { PatchCategoriaDto } from './dto/patch-categoria.dto';
import { PutCategoriaDto } from './dto/put-categoria.dto';

@Injectable()
export class CategoriasService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAllActive() {
    return this.prisma.categoria.findMany({
      where: {
        active: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }

  async findAllAdmin(
    filter: CategoriaFilterDto,
  ) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.CategoriaWhereInput = {};

    if (filter.search?.trim()) {
      const search = filter.search.trim();

      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (filter.active !== undefined) {
      where.active = filter.active;
    }

    const [categorias, totalItems] =
      await this.prisma.$transaction([
        this.prisma.categoria.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            id: 'asc',
          },
        }),

        this.prisma.categoria.count({
          where,
        }),
      ]);

    const totalPages = Math.max(
      1,
      Math.ceil(totalItems / limit),
    );

    return {
      content: categorias,
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

  async findById(id: number) {
    const categoria =
      await this.prisma.categoria.findFirst({
        where: {
          id,
          active: true,
        },
      });

    if (!categoria) {
      throw new NotFoundException(
        'Categoria não encontrada.',
      );
    }

    return categoria;
  }

  async create(dto: CreateCategoriaDto) {
    const name = dto.name.trim();

    await this.ensureNameIsAvailable(name);

    return this.prisma.categoria.create({
      data: {
        name,
        description:
          dto.description?.trim() || null,
        active: dto.active ?? true,
      },
    });
  }

  async update(
    id: number,
    dto: PutCategoriaDto,
  ) {
    await this.ensureCategoriaExists(id);

    const name = dto.name.trim();

    await this.ensureNameIsAvailable(
      name,
      id,
    );

    if (!dto.active) {
      return this.prisma.$transaction(
        async (transaction) => {
          const categoria =
            await transaction.categoria.update({
              where: {
                id,
              },
              data: {
                name,
                description:
                  dto.description?.trim() ||
                  null,
                active: false,
              },
            });

          await transaction.produto.updateMany({
            where: {
              categoryId: id,
              active: true,
            },
            data: {
              active: false,
            },
          });

          return categoria;
        },
      );
    }

    return this.prisma.categoria.update({
      where: {
        id,
      },
      data: {
        name,
        description:
          dto.description?.trim() || null,
        active: true,
      },
    });
  }

  async partialUpdate(
    id: number,
    dto: PatchCategoriaDto,
  ) {
    await this.ensureCategoriaExists(id);

    const data: Prisma.CategoriaUpdateInput =
      {};

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

    if (dto.active !== undefined) {
      data.active = dto.active;
    }

    if (dto.active === false) {
      return this.prisma.$transaction(
        async (transaction) => {
          const categoria =
            await transaction.categoria.update({
              where: {
                id,
              },
              data,
            });

          await transaction.produto.updateMany({
            where: {
              categoryId: id,
              active: true,
            },
            data: {
              active: false,
            },
          });

          return categoria;
        },
      );
    }

    return this.prisma.categoria.update({
      where: {
        id,
      },
      data,
    });
  }

  async delete(id: number): Promise<void> {
    const categoria =
      await this.prisma.categoria.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          _count: {
            select: {
              produtos: true,
            },
          },
        },
      });

    if (!categoria) {
      throw new NotFoundException(
        'Categoria não encontrada.',
      );
    }

    if (categoria._count.produtos > 0) {
      await this.deactivateCategoriaAndProdutos(
        id,
      );

      return;
    }

    try {
      await this.prisma.categoria.delete({
        where: {
          id,
        },
      });
    } catch (error) {
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        await this.deactivateCategoriaAndProdutos(
          id,
        );

        return;
      }

      throw error;
    }
  }

  private async ensureCategoriaExists(
    id: number,
  ): Promise<void> {
    const categoria =
      await this.prisma.categoria.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
        },
      });

    if (!categoria) {
      throw new NotFoundException(
        'Categoria não encontrada.',
      );
    }
  }

  private async ensureNameIsAvailable(
    name: string,
    ignoreCategoriaId?: number,
  ): Promise<void> {
    const categoria =
      await this.prisma.categoria.findFirst({
        where: {
          name,
          NOT:
            ignoreCategoriaId !== undefined
              ? {
                  id: ignoreCategoriaId,
                }
              : undefined,
        },
        select: {
          id: true,
        },
      });

    if (categoria) {
      throw new ConflictException(
        'Já existe uma categoria com esse nome.',
      );
    }
  }

  private async deactivateCategoriaAndProdutos(
    id: number,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.categoria.update({
        where: {
          id,
        },
        data: {
          active: false,
        },
      }),

      this.prisma.produto.updateMany({
        where: {
          categoryId: id,
          active: true,
        },
        data: {
          active: false,
        },
      }),
    ]);
  }
}