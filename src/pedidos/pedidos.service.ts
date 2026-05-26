import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusPedido } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdateStatusPedidoDto } from './dto/update-status-pedido.dto';

@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const pedidos = await this.prisma.pedido.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });

    return pedidos.map((pedido) => this.toResponse(pedido));
  }

  async findById(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: this.defaultInclude(),
    });

    if (!pedido) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    return this.toResponse(pedido);
  }

  async findMyPedidos(clienteId: number) {
    const pedidos = await this.prisma.pedido.findMany({
      where: { clienteId },
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });

    return pedidos.map((pedido) => this.toResponse(pedido));
  }

  async findMyPedidoById(id: number, clienteId: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: this.defaultInclude(),
    });

    if (!pedido) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (pedido.clienteId !== clienteId) {
      throw new ForbiddenException('Você não tem permissão para acessar este pedido.');
    }

    return this.toResponse(pedido);
  }

  async create(clienteId: number, dto: CreatePedidoDto) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    const produtoIds = dto.items.map((item) => item.produtoId);
    const uniqueProdutoIds = [...new Set(produtoIds)];

    if (produtoIds.length !== uniqueProdutoIds.length) {
      throw new BadRequestException(
        'Não envie o mesmo produto mais de uma vez no pedido.',
      );
    }

    const produtos = await this.prisma.produto.findMany({
      where: {
        id: {
          in: uniqueProdutoIds,
        },
      },
    });

    if (produtos.length !== uniqueProdutoIds.length) {
      throw new NotFoundException('Um ou mais produtos não foram encontrados.');
    }

    const itemsData = dto.items.map((item) => {
      const produto = produtos.find((produto) => produto.id === item.produtoId);

      if (!produto) {
        throw new NotFoundException('Produto não encontrado.');
      }

      if (!produto.active) {
        throw new BadRequestException(
          `O produto "${produto.name}" não está disponível para compra.`,
        );
      }

      if (item.quantity > produto.stockQuantity) {
        throw new BadRequestException(
          `Estoque insuficiente para o produto "${produto.name}".`,
        );
      }

      const unitPrice = new Prisma.Decimal(produto.price);
      const subtotal = unitPrice.mul(item.quantity);

      return {
        produto,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      };
    });

    const totalPrice = itemsData.reduce(
      (sum, item) => sum.add(item.subtotal),
      new Prisma.Decimal(0),
    );

    const pedido = await this.prisma.$transaction(async (tx) => {
      for (const item of itemsData) {
        await tx.produto.update({
          where: { id: item.produto.id },
          data: {
            stockQuantity: {
              decrement: item.quantity,
            },
          },
        });
      }

      return tx.pedido.create({
        data: {
          clienteId,
          status: StatusPedido.PENDENTE,
          totalPrice,
          items: {
            create: itemsData.map((item) => ({
              produtoId: item.produto.id,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
            })),
          },
        },
        include: this.defaultInclude(),
      });
    });

    return this.toResponse(pedido);
  }

  async updateStatus(id: number, dto: UpdateStatusPedidoDto) {
    await this.ensurePedidoExists(id);

    const pedido = await this.prisma.pedido.update({
      where: { id },
      data: {
        status: dto.status,
      },
      include: this.defaultInclude(),
    });

    return this.toResponse(pedido);
  }

  private async ensurePedidoExists(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!pedido) {
      throw new NotFoundException('Pedido não encontrado.');
    }
  }

  private defaultInclude() {
    return {
      cliente: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        include: {
          produto: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
            },
          },
        },
      },
    };
  }

  private toResponse(
    pedido: Prisma.PedidoGetPayload<{
      include: ReturnType<PedidosService['defaultInclude']>;
    }>,
  ) {
    return {
      id: pedido.id,
      status: pedido.status,
      totalPrice: Number(pedido.totalPrice),
      clienteId: pedido.clienteId,
      clienteName: pedido.cliente.name,
      clienteEmail: pedido.cliente.email,
      items: pedido.items.map((item) => ({
        id: item.id,
        produtoId: item.produtoId,
        produtoName: item.produto.name,
        imageUrl: item.produto.imageUrl,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),
      createdAt: pedido.createdAt,
      updatedAt: pedido.updatedAt,
    };
  }
}