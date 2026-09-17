import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StatusPedido } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreatePedidoDto } from '../dto/create-pedido.dto';
import {
  pedidoDefaultInclude,
  toPedidoResponse,
} from '../pedido-response.mapper';
import { PedidoShippingService } from '../pedido-shipping.service';

@Injectable()
export class PedidoCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidoShippingService: PedidoShippingService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    clienteId: number,
    dto: CreatePedidoDto,
    idempotencyKey: string,
  ) {
    const pedidoExistente = await this.prisma.pedido.findUnique({
      where: {
        clienteId_idempotencyKey: {
          clienteId,
          idempotencyKey,
        },
      },
      include: pedidoDefaultInclude,
    });

    if (pedidoExistente) {
      this.assertSameIdempotencyRequest(pedidoExistente, dto);

      return toPedidoResponse(pedidoExistente);
    }

    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id: clienteId,
      },

      select: {
        id: true,
        zipCode: true,
        street: true,
        addressNumber: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
      },
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
      const produto = produtos.find(
        (produtoAtual) => produtoAtual.id === item.produtoId,
      );

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

    const shippingData = await this.pedidoShippingService.prepararFrete(
      cliente,
      dto,
    );

    const productsTotal = itemsData.reduce(
      (sum, item) => sum.add(item.subtotal),
      new Prisma.Decimal(0),
    );

    const shippingPrice = new Prisma.Decimal(shippingData.shippingPrice);
    const totalPrice = productsTotal.add(shippingPrice);

    const expirationMinutes =
      this.configService.get<number>('PENDING_ORDER_EXPIRATION_MINUTES') ?? 30;

    const paymentExpiresAt = new Date(Date.now() + expirationMinutes * 60_000);

    try {
      const pedido = await this.prisma.$transaction(async (tx) => {
        for (const item of itemsData) {
          const stockUpdate = await tx.produto.updateMany({
            where: {
              id: item.produto.id,
              active: true,
              stockQuantity: {
                gte: item.quantity,
              },
            },
            data: {
              stockQuantity: {
                decrement: item.quantity,
              },
            },
          });

          if (stockUpdate.count !== 1) {
            throw new BadRequestException(
              `O estoque do produto "${item.produto.name}" foi alterado. Verifique a quantidade disponível e tente novamente.`,
            );
          }
        }

        return tx.pedido.create({
          data: {
            clienteId,
            idempotencyKey,
            status: StatusPedido.PENDENTE,
            totalPrice,
            shippingPrice,
            paymentExpiresAt,
            shippingServiceId: shippingData.shippingServiceId,
            shippingServiceName: shippingData.shippingServiceName,
            shippingCompanyName: shippingData.shippingCompanyName,
            shippingDeliveryTime: shippingData.shippingDeliveryTime,
            shippingZipCode: shippingData.shippingZipCode,
            shippingStreet: shippingData.shippingStreet,
            shippingAddressNumber: shippingData.shippingAddressNumber,
            shippingComplement: shippingData.shippingComplement,
            shippingNeighborhood: shippingData.shippingNeighborhood,
            shippingCity: shippingData.shippingCity,
            shippingState: shippingData.shippingState,
            items: {
              create: itemsData.map((item) => ({
                produtoId: item.produto.id,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
              })),
            },
          },
          include: pedidoDefaultInclude,
        });
      });

      return toPedidoResponse(pedido);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const pedidoVencedor = await this.prisma.pedido.findUnique({
          where: {
            clienteId_idempotencyKey: {
              clienteId,
              idempotencyKey,
            },
          },
          include: pedidoDefaultInclude,
        });

        if (pedidoVencedor) {
          this.assertSameIdempotencyRequest(pedidoVencedor, dto);

          return toPedidoResponse(pedidoVencedor);
        }
      }

      throw error;
    }
  }

  private assertSameIdempotencyRequest(
    pedido: {
      shippingServiceId: string | null;
      shippingPrice: Prisma.Decimal;
      shippingZipCode: string | null;
      items: Array<{
        produtoId: number;
        quantity: number;
      }>;
    },
    dto: CreatePedidoDto,
  ) {
    const requestedZipCode = dto.quotedZipCode?.replace(/\D/g, '') ?? null;

    const sameShippingService =
      pedido.shippingServiceId === (dto.shippingServiceId ?? null);

    const sameShippingPrice =
      dto.quotedShippingPrice !== null &&
      dto.quotedShippingPrice !== undefined &&
      pedido.shippingPrice.equals(new Prisma.Decimal(dto.quotedShippingPrice));

    const sameZipCode = pedido.shippingZipCode === requestedZipCode;

    const sameItems =
      pedido.items.length === dto.items.length &&
      dto.items.every((requestedItem) =>
        pedido.items.some(
          (savedItem) =>
            savedItem.produtoId === requestedItem.produtoId &&
            savedItem.quantity === requestedItem.quantity,
        ),
      );

    if (
      !sameShippingService ||
      !sameShippingPrice ||
      !sameZipCode ||
      !sameItems
    ) {
      throw new ConflictException(
        'Esta chave de idempotência já foi usada com dados diferentes.',
      );
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
