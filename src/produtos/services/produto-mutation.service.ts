import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateProdutoDto } from '../dto/create-produto.dto';
import { PatchProdutoDto } from '../dto/patch-produto.dto';
import { PutProdutoDto } from '../dto/put-produto.dto';
import { ProdutoImageService } from '../produto-image.service';
import {
  buildProdutoShippingData,
  buildProdutoShippingPatch,
  toProdutoResponse,
} from '../produto.utils';

@Injectable()
export class ProdutoMutationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly produtoImageService: ProdutoImageService,
  ) {}

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
        where: this.buildStockUpdateWhere(id, dto.expectedStockQuantity),
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

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ConflictException(
          'O produto ou seu estoque foi alterado. Atualize a lista e reabra a edição antes de salvar novamente.',
        );
      }

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
        where:
          dto.stockQuantity !== undefined
            ? this.buildStockUpdateWhere(id, dto.expectedStockQuantity)
            : { id },
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

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ConflictException(
          'O produto ou seu estoque foi alterado. Atualize a lista e reabra a edição antes de salvar novamente.',
        );
      }

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

  private buildStockUpdateWhere(
    id: number,
    expectedStockQuantity: number | undefined,
  ): Prisma.ProdutoWhereUniqueInput {
    if (
      expectedStockQuantity === undefined ||
      !Number.isInteger(expectedStockQuantity) ||
      expectedStockQuantity < 0
    ) {
      throw new BadRequestException(
        'Informe o estoque original para atualizar a quantidade. Atualize a lista e reabra a edição do produto.',
      );
    }

    return {
      id,
      stockQuantity: expectedStockQuantity,
    };
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
