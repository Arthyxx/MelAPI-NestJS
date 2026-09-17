import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusPedido } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UpdateStatusPedidoDto } from '../dto/update-status-pedido.dto';
import {
  pedidoDefaultInclude,
  toPedidoResponse,
} from '../pedido-response.mapper';
import { PedidoQueryService } from './pedido-query.service';

const ALLOWED_STATUS_TRANSITIONS: Record<StatusPedido, StatusPedido[]> = {
  [StatusPedido.PENDENTE]: [StatusPedido.CANCELADO],
  [StatusPedido.PAGO]: [StatusPedido.CONFIRMADO],
  [StatusPedido.CONFIRMADO]: [StatusPedido.PREPARANDO],
  [StatusPedido.PREPARANDO]: [StatusPedido.ENVIADO],
  [StatusPedido.CANCELAMENTO_PENDENTE]: [],
  [StatusPedido.ENVIADO]: [StatusPedido.ENTREGUE],
  [StatusPedido.ENTREGUE]: [],
  [StatusPedido.CANCELADO]: [],
};

const REFUNDABLE_ORDER_STATUSES: StatusPedido[] = [
  StatusPedido.PAGO,
  StatusPedido.CONFIRMADO,
  StatusPedido.PREPARANDO,
];

@Injectable()
export class PedidoLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidoQueryService: PedidoQueryService,
  ) {}

  async updateStatus(id: number, dto: UpdateStatusPedidoDto) {
    const pedidoAtual = await this.prisma.pedido.findUnique({
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
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (pedidoAtual.status === dto.status) {
      return this.pedidoQueryService.findById(id);
    }

    const allowedStatuses = ALLOWED_STATUS_TRANSITIONS[pedidoAtual.status];

    if (!allowedStatuses.includes(dto.status)) {
      throw new BadRequestException(
        `Não é permitido alterar o pedido de ${pedidoAtual.status} para ${dto.status}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.pedido.updateMany({
        where: {
          id,
          status: pedidoAtual.status,
        },

        data: {
          status: dto.status,
        },
      });

      if (statusUpdate.count !== 1) {
        throw new BadRequestException(
          'O status deste pedido foi alterado por outra operação. Atualize a página e tente novamente.',
        );
      }

      if (dto.status === StatusPedido.CANCELADO) {
        await this.restoreStock(tx, pedidoAtual.items);
      }

      const pedidoAtualizado = await tx.pedido.findUnique({
        where: {
          id,
        },

        include: pedidoDefaultInclude,
      });

      if (!pedidoAtualizado) {
        throw new NotFoundException('Pedido não encontrado.');
      }

      return toPedidoResponse(pedidoAtualizado);
    });
  }

  async iniciarCancelamentoComReembolso(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!pedido) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (pedido.status === StatusPedido.CANCELAMENTO_PENDENTE) {
      return;
    }

    if (!REFUNDABLE_ORDER_STATUSES.includes(pedido.status)) {
      throw new BadRequestException(
        'Este pedido não pode ser cancelado com reembolso.',
      );
    }

    const statusUpdate = await this.prisma.pedido.updateMany({
      where: {
        id: pedido.id,
        status: pedido.status,
      },
      data: {
        status: StatusPedido.CANCELAMENTO_PENDENTE,
      },
    });

    if (statusUpdate.count !== 1) {
      throw new BadRequestException(
        'O status deste pedido foi alterado por outra operação. Atualize a página e tente novamente.',
      );
    }
  }

  async finalizarCancelamentoReembolsado(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
        items: {
          select: {
            produtoId: true,
            quantity: true,
          },
        },
      },
    });

    if (!pedido) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (pedido.status === StatusPedido.CANCELADO) {
      return this.pedidoQueryService.findById(id);
    }

    if (pedido.status !== StatusPedido.CANCELAMENTO_PENDENTE) {
      throw new BadRequestException(
        'Este pedido não está aguardando finalização de reembolso.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.pedido.updateMany({
        where: {
          id: pedido.id,
          status: StatusPedido.CANCELAMENTO_PENDENTE,
        },
        data: {
          status: StatusPedido.CANCELADO,
        },
      });

      if (statusUpdate.count !== 1) {
        return;
      }

      await this.restoreStock(tx, pedido.items);
    });

    return this.pedidoQueryService.findById(id);
  }

  async expirarPedidoPendente(id: number): Promise<boolean> {
    const pedido = await this.prisma.pedido.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
        paymentExpiresAt: true,
        items: {
          select: {
            produtoId: true,
            quantity: true,
          },
        },
      },
    });

    if (
      !pedido ||
      pedido.status !== StatusPedido.PENDENTE ||
      !pedido.paymentExpiresAt ||
      pedido.paymentExpiresAt.getTime() > Date.now()
    ) {
      return false;
    }

    return this.prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.pedido.updateMany({
        where: {
          id: pedido.id,
          status: StatusPedido.PENDENTE,
          paymentExpiresAt: {
            lte: new Date(),
          },
        },
        data: {
          status: StatusPedido.CANCELADO,
        },
      });

      if (statusUpdate.count !== 1) {
        return false;
      }

      await this.restoreStock(tx, pedido.items);

      return true;
    });
  }

  private async restoreStock(
    tx: Prisma.TransactionClient,
    items: Array<{
      produtoId: number;
      quantity: number;
    }>,
  ) {
    for (const item of items) {
      await tx.produto.update({
        where: {
          id: item.produtoId,
        },

        data: {
          stockQuantity: {
            increment: item.quantity,
          },
        },
      });
    }
  }
}
