import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StatusPedido,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { PedidoFilterDto } from './dto/pedido-filter.dto';
import { UpdateStatusPedidoDto } from './dto/update-status-pedido.dto';

const ALLOWED_STATUS_TRANSITIONS: Record<
  StatusPedido,
  StatusPedido[]
> = {
  [StatusPedido.PENDENTE]: [
    StatusPedido.PAGO,
    StatusPedido.CANCELADO,
  ],
  [StatusPedido.PAGO]: [
    StatusPedido.CONFIRMADO,
    StatusPedido.CANCELADO,
  ],
  [StatusPedido.CONFIRMADO]: [
    StatusPedido.PREPARANDO,
    StatusPedido.CANCELADO,
  ],
  [StatusPedido.PREPARANDO]: [
    StatusPedido.ENVIADO,
    StatusPedido.CANCELADO,
  ],
  [StatusPedido.ENVIADO]: [
    StatusPedido.ENTREGUE,
  ],
  [StatusPedido.ENTREGUE]: [],
  [StatusPedido.CANCELADO]: [],
};

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(filter: PedidoFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PedidoWhereInput = {};

    if (filter.status !== undefined) {
      where.status = filter.status;
    }

    const search = filter.search?.trim();

    if (search) {
      const numericSearch =
        /^\d+$/.test(search)
          ? Number(search)
          : null;

      where.OR = [
        {
          cliente: {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          cliente: {
            email: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        ...(numericSearch !== null
          ? [
              {
                id: numericSearch,
              },
            ]
          : []),
      ];
    }

    const [pedidos, totalItems] =
      await this.prisma.$transaction([
        this.prisma.pedido.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: this.defaultInclude(),
        }),

        this.prisma.pedido.count({
          where,
        }),
      ]);

    const totalPages = Math.max(
      1,
      Math.ceil(totalItems / limit),
    );

    return {
      content: pedidos.map((pedido) =>
        this.toResponse(pedido),
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

  async findById(id: number) {
    const pedido =
      await this.prisma.pedido.findUnique({
        where: {
          id,
        },
        include: this.defaultInclude(),
      });

    if (!pedido) {
      throw new NotFoundException(
        'Pedido não encontrado.',
      );
    }

    return this.toResponse(pedido);
  }

  async findMyPedidos(
    clienteId: number,
  ) {
    const pedidos =
      await this.prisma.pedido.findMany({
        where: {
          clienteId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: this.defaultInclude(),
      });

    return pedidos.map((pedido) =>
      this.toResponse(pedido),
    );
  }

  async findMyPedidoById(
    id: number,
    clienteId: number,
  ) {
    const pedido =
      await this.prisma.pedido.findUnique({
        where: {
          id,
        },
        include: this.defaultInclude(),
      });

    if (!pedido) {
      throw new NotFoundException(
        'Pedido não encontrado.',
      );
    }

    if (pedido.clienteId !== clienteId) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este pedido.',
      );
    }

    return this.toResponse(pedido);
  }

  async create(
    clienteId: number,
    dto: CreatePedidoDto,
  ) {
    const cliente =
      await this.prisma.cliente.findUnique({
        where: {
          id: clienteId,
        },
        select: {
          id: true,
        },
      });

    if (!cliente) {
      throw new NotFoundException(
        'Cliente não encontrado.',
      );
    }

    const produtoIds =
      dto.items.map(
        (item) => item.produtoId,
      );

    const uniqueProdutoIds = [
      ...new Set(produtoIds),
    ];

    if (
      produtoIds.length !==
      uniqueProdutoIds.length
    ) {
      throw new BadRequestException(
        'Não envie o mesmo produto mais de uma vez no pedido.',
      );
    }

    const produtos =
      await this.prisma.produto.findMany({
        where: {
          id: {
            in: uniqueProdutoIds,
          },
        },
      });

    if (
      produtos.length !==
      uniqueProdutoIds.length
    ) {
      throw new NotFoundException(
        'Um ou mais produtos não foram encontrados.',
      );
    }

    const itemsData =
      dto.items.map((item) => {
        const produto =
          produtos.find(
            (produtoAtual) =>
              produtoAtual.id ===
              item.produtoId,
          );

        if (!produto) {
          throw new NotFoundException(
            'Produto não encontrado.',
          );
        }

        if (!produto.active) {
          throw new BadRequestException(
            `O produto "${produto.name}" não está disponível para compra.`,
          );
        }

        if (
          item.quantity >
          produto.stockQuantity
        ) {
          throw new BadRequestException(
            `Estoque insuficiente para o produto "${produto.name}".`,
          );
        }

        const unitPrice =
          new Prisma.Decimal(
            produto.price,
          );

        const subtotal =
          unitPrice.mul(
            item.quantity,
          );

        return {
          produto,
          quantity: item.quantity,
          unitPrice,
          subtotal,
        };
      });

    const totalPrice =
      itemsData.reduce(
        (sum, item) =>
          sum.add(item.subtotal),
        new Prisma.Decimal(0),
      );

    const pedido =
      await this.prisma.$transaction(
        async (tx) => {
          for (const item of itemsData) {
            const stockUpdate =
              await tx.produto.updateMany({
                where: {
                  id: item.produto.id,
                  active: true,
                  stockQuantity: {
                    gte: item.quantity,
                  },
                },
                data: {
                  stockQuantity: {
                    decrement:
                      item.quantity,
                  },
                },
              });

            if (
              stockUpdate.count !== 1
            ) {
              throw new BadRequestException(
                `O estoque do produto "${item.produto.name}" foi alterado. Verifique a quantidade disponível e tente novamente.`,
              );
            }
          }

          return tx.pedido.create({
            data: {
              clienteId,
              status:
                StatusPedido.PENDENTE,
              totalPrice,
              items: {
                create:
                  itemsData.map(
                    (item) => ({
                      produtoId:
                        item.produto.id,
                      quantity:
                        item.quantity,
                      unitPrice:
                        item.unitPrice,
                      subtotal:
                        item.subtotal,
                    }),
                  ),
              },
            },
            include:
              this.defaultInclude(),
          });
        },
      );

    return this.toResponse(pedido);
  }

  async updateStatus(
    id: number,
    dto: UpdateStatusPedidoDto,
  ) {
    const pedidoAtual =
      await this.prisma.pedido.findUnique({
        where: {
          id,
        },
        include: {
          items: {
            select: {
              produtoId: true,
              quantity: true,
            },
          },
        },
      });

    if (!pedidoAtual) {
      throw new NotFoundException(
        'Pedido não encontrado.',
      );
    }

    if (
      pedidoAtual.status === dto.status
    ) {
      return this.findById(id);
    }

    const allowedStatuses =
      ALLOWED_STATUS_TRANSITIONS[
        pedidoAtual.status
      ];

    if (
      !allowedStatuses.includes(
        dto.status,
      )
    ) {
      throw new BadRequestException(
        `Não é permitido alterar o pedido de ${pedidoAtual.status} para ${dto.status}.`,
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const statusUpdate =
          await tx.pedido.updateMany({
            where: {
              id,
              status:
                pedidoAtual.status,
            },
            data: {
              status: dto.status,
            },
          });

        if (
          statusUpdate.count !== 1
        ) {
          throw new BadRequestException(
            'O status deste pedido foi alterado por outra operação. Atualize a página e tente novamente.',
          );
        }

        if (
          dto.status ===
          StatusPedido.CANCELADO
        ) {
          for (
            const item of
            pedidoAtual.items
          ) {
            await tx.produto.update({
              where: {
                id: item.produtoId,
              },
              data: {
                stockQuantity: {
                  increment:
                    item.quantity,
                },
              },
            });
          }
        }

        const pedidoAtualizado =
          await tx.pedido.findUnique({
            where: {
              id,
            },
            include:
              this.defaultInclude(),
          });

        if (!pedidoAtualizado) {
          throw new NotFoundException(
            'Pedido não encontrado.',
          );
        }

        return this.toResponse(
          pedidoAtualizado,
        );
      },
    );
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
      include: ReturnType<
        PedidosService['defaultInclude']
      >;
    }>,
  ) {
    return {
      id: pedido.id,
      status: pedido.status,
      totalPrice: Number(
        pedido.totalPrice,
      ),
      clienteId: pedido.clienteId,
      clienteName:
        pedido.cliente.name,
      clienteEmail:
        pedido.cliente.email,
      items: pedido.items.map(
        (item) => ({
          id: item.id,
          produtoId:
            item.produtoId,
          produtoName:
            item.produto.name,
          imageUrl:
            item.produto.imageUrl,
          quantity:
            item.quantity,
          unitPrice: Number(
            item.unitPrice,
          ),
          subtotal: Number(
            item.subtotal,
          ),
        }),
      ),
      createdAt:
        pedido.createdAt,
      updatedAt:
        pedido.updatedAt,
    };
  }
}