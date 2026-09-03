import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StatusPedido } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PedidosService } from './pedidos.service';

@Injectable()
export class PedidosExpirationService {
  private readonly logger = new Logger(PedidosExpirationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidosService: PedidosService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expirarPedidosPendentes() {
    const pedidosExpirados = await this.prisma.pedido.findMany({
      where: {
        status: StatusPedido.PENDENTE,
        paymentExpiresAt: {
          not: null,
          lte: new Date(),
        },
      },

      select: {
        id: true,
      },

      orderBy: {
        paymentExpiresAt: 'asc',
      },

      take: 100,
    });

    if (pedidosExpirados.length === 0) {
      return;
    }

    let cancelados = 0;

    for (const pedido of pedidosExpirados) {
      const expirado = await this.pedidosService.expirarPedidoPendente(
        pedido.id,
      );

      if (expirado) {
        cancelados += 1;
      }
    }

    if (cancelados > 0) {
      this.logger.log(
        `${cancelados} pedido(s) pendente(s) expirado(s) e cancelado(s).`,
      );
    }
  }
}
