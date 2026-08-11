import { Injectable } from '@nestjs/common';
import {
  Role,
  StatusPedido,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getSummary() {
    const [
      clientesAtivos,
      categoriasAtivas,
      produtosAtivos,
      produtosSemEstoque,
      pedidosTotal,
      pedidosPendentes,
      pedidosEntregues,
      pedidosCancelados,
      faturamento,
    ] = await this.prisma.$transaction([
      this.prisma.cliente.count({
        where: {
          role: Role.CLIENTE,
          active: true,
        },
      }),

      this.prisma.categoria.count({
        where: {
          active: true,
        },
      }),

      this.prisma.produto.count({
        where: {
          active: true,
          category: {
            active: true,
          },
        },
      }),

      this.prisma.produto.count({
        where: {
          active: true,
          stockQuantity: {
            lte: 0,
          },
          category: {
            active: true,
          },
        },
      }),

      this.prisma.pedido.count(),

      this.prisma.pedido.count({
        where: {
          status:
            StatusPedido.PENDENTE,
        },
      }),

      this.prisma.pedido.count({
        where: {
          status:
            StatusPedido.ENTREGUE,
        },
      }),

      this.prisma.pedido.count({
        where: {
          status:
            StatusPedido.CANCELADO,
        },
      }),

      this.prisma.pedido.aggregate({
        where: {
          status: {
            notIn: [
              StatusPedido.PENDENTE,
              StatusPedido.CANCELADO,
            ],
          },
        },
        _sum: {
          totalPrice: true,
        },
      }),
    ]);

    return {
      clientes: {
        ativos: clientesAtivos,
      },

      categorias: {
        ativas: categoriasAtivas,
      },

      produtos: {
        ativos: produtosAtivos,
        semEstoque: produtosSemEstoque,
      },

      pedidos: {
        total: pedidosTotal,
        pendentes: pedidosPendentes,
        entregues: pedidosEntregues,
        cancelados: pedidosCancelados,
      },

      faturamento: {
        total: Number(
          faturamento._sum.totalPrice ??
            0,
        ),
      },
    };
  }
}