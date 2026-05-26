import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StatusPedido } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAvaliacaoProdutoDto } from './dto/create-avaliacao-produto.dto';
import { PatchAvaliacaoProdutoDto } from './dto/patch-avaliacao-produto.dto';

@Injectable()
export class AvaliacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProdutoId(produtoId: number) {
    await this.ensureProdutoExists(produtoId);

    const avaliacoes = await this.prisma.avaliacaoProduto.findMany({
      where: { produtoId },
      orderBy: { createdAt: 'desc' },
      include: {
        cliente: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return avaliacoes.map((avaliacao) => this.toResponse(avaliacao));
  }

  async canReview(produtoId: number, clienteId: number) {
    await this.ensureProdutoExists(produtoId);

    const existingReview = await this.prisma.avaliacaoProduto.findUnique({
      where: {
        produtoId_clienteId: {
          produtoId,
          clienteId,
        },
      },
      select: { id: true },
    });

    if (existingReview) {
      return {
        canReview: false,
        message: 'Você já avaliou este produto.',
      };
    }

    const deliveredOrder = await this.findDeliveredOrderWithProduct(
      produtoId,
      clienteId,
    );

    if (!deliveredOrder) {
      return {
        canReview: false,
        message:
          'Você só poderá avaliar este produto após receber um pedido contendo ele.',
      };
    }

    return {
      canReview: true,
      message: 'Você pode avaliar este produto.',
    };
  }

  async create(
    produtoId: number,
    clienteId: number,
    dto: CreateAvaliacaoProdutoDto,
  ) {
    await this.ensureProdutoExists(produtoId);

    const existingReview = await this.prisma.avaliacaoProduto.findUnique({
      where: {
        produtoId_clienteId: {
          produtoId,
          clienteId,
        },
      },
      select: { id: true },
    });

    if (existingReview) {
      throw new ConflictException('Você já avaliou este produto.');
    }

    const deliveredOrder = await this.findDeliveredOrderWithProduct(
      produtoId,
      clienteId,
    );

    if (!deliveredOrder) {
      throw new ForbiddenException(
        'Você só pode avaliar produtos comprados e entregues.',
      );
    }

    const avaliacao = await this.prisma.avaliacaoProduto.create({
      data: {
        produtoId,
        clienteId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      },
      include: {
        cliente: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return this.toResponse(avaliacao);
  }

  async updateMinhaAvaliacao(
    produtoId: number,
    clienteId: number,
    dto: PatchAvaliacaoProdutoDto,
  ) {
    await this.ensureProdutoExists(produtoId);

    const avaliacao = await this.prisma.avaliacaoProduto.findUnique({
      where: {
        produtoId_clienteId: {
          produtoId,
          clienteId,
        },
      },
      select: { id: true },
    });

    if (!avaliacao) {
      throw new NotFoundException('Avaliação não encontrada.');
    }

    const data: {
      rating?: number;
      comment?: string | null;
    } = {};

    if (dto.rating !== undefined) {
      data.rating = dto.rating;
    }

    if (dto.comment !== undefined) {
      data.comment = dto.comment.trim() || null;
    }

    const updatedReview = await this.prisma.avaliacaoProduto.update({
      where: { id: avaliacao.id },
      data,
      include: {
        cliente: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return this.toResponse(updatedReview);
  }

  async deleteMinhaAvaliacao(produtoId: number, clienteId: number) {
    await this.ensureProdutoExists(produtoId);

    const avaliacao = await this.prisma.avaliacaoProduto.findUnique({
      where: {
        produtoId_clienteId: {
          produtoId,
          clienteId,
        },
      },
      select: { id: true },
    });

    if (!avaliacao) {
      throw new NotFoundException('Avaliação não encontrada.');
    }

    await this.prisma.avaliacaoProduto.delete({
      where: { id: avaliacao.id },
    });
  }

  private async ensureProdutoExists(produtoId: number) {
    const produto = await this.prisma.produto.findUnique({
      where: { id: produtoId },
      select: { id: true },
    });

    if (!produto) {
      throw new NotFoundException('Produto não encontrado.');
    }
  }

  private async findDeliveredOrderWithProduct(
    produtoId: number,
    clienteId: number,
  ) {
    return this.prisma.pedido.findFirst({
      where: {
        clienteId,
        status: StatusPedido.ENTREGUE,
        items: {
          some: {
            produtoId,
          },
        },
      },
      select: {
        id: true,
      },
    });
  }

  private toResponse(avaliacao: {
    id: number;
    rating: number;
    comment: string | null;
    produtoId: number;
    clienteId: number;
    createdAt: Date;
    updatedAt: Date;
    cliente: {
      id: number;
      name: string;
    };
  }) {
    return {
      id: avaliacao.id,
      rating: avaliacao.rating,
      comment: avaliacao.comment,
      produtoId: avaliacao.produtoId,
      clienteId: avaliacao.clienteId,
      clienteName: avaliacao.cliente.name,
      createdAt: avaliacao.createdAt,
      updatedAt: avaliacao.updatedAt,
    };
  }
}