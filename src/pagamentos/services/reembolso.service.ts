import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, StatusPedido } from '@prisma/client';

import { PedidosService } from '../../pedidos/pedidos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MercadoPagoService } from '../mercado-pago.service';

@Injectable()
export class ReembolsoService {
  private readonly logger = new Logger(ReembolsoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly pedidosService: PedidosService,
  ) {}

  async cancelarPedidoComReembolso(pedidoId: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: {
        id: pedidoId,
      },
      select: {
        id: true,
        status: true,
        totalPrice: true,
        pagamentos: {
          where: {
            provider: 'MERCADO_PAGO',
            status: {
              in: ['approved', 'refunded'],
            },
            paymentId: {
              not: null,
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!pedido) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    const pagamento = pedido.pagamentos[0];

    if (pedido.status === StatusPedido.CANCELADO) {
      if (
        pagamento?.refundStatus === 'approved' &&
        pagamento.refundId &&
        pagamento.refundAmount !== null
      ) {
        return {
          pedidoId: pedido.id,
          status: StatusPedido.CANCELADO,
          refunded: true,
          refundId: pagamento.refundId,
          refundAmount: Number(pagamento.refundAmount),
        };
      }

      if (!pagamento?.paymentId) {
        throw new BadRequestException(
          'Este pedido já está cancelado e não possui pagamento aprovado para reembolso.',
        );
      }

      throw new ConflictException(
        'Este pedido já está cancelado, mas não possui reembolso aprovado registrado.',
      );
    }

    if (!pagamento?.paymentId) {
      throw new BadRequestException(
        'Não foi encontrado um pagamento aprovado para este pedido.',
      );
    }

    if (
      pagamento.refundStatus === 'approved' &&
      pagamento.refundId &&
      pagamento.refundAmount !== null
    ) {
      await this.pedidosService.iniciarCancelamentoComReembolso(pedido.id);
      await this.pedidosService.finalizarCancelamentoReembolsado(pedido.id);

      return {
        pedidoId: pedido.id,
        status: StatusPedido.CANCELADO,
        refunded: true,
        refundId: pagamento.refundId,
        refundAmount: Number(pagamento.refundAmount),
      };
    }

    await this.pedidosService.iniciarCancelamentoComReembolso(pedido.id);

    const refund = await this.mercadoPagoService.reembolsarPagamento(
      pagamento.paymentId,
    );

    if (refund.status !== 'approved') {
      this.logger.error(
        `O reembolso ${refund.refundId} do pagamento ${pagamento.paymentId} retornou status ${refund.status}.`,
      );

      throw new ServiceUnavailableException(
        'O Mercado Pago ainda não confirmou o reembolso.',
      );
    }

    const refundAmount = new Prisma.Decimal(refund.amount);

    if (!refundAmount.equals(pedido.totalPrice)) {
      this.logger.error(
        `O reembolso ${refund.refundId} possui valor ${refundAmount.toString()}, mas o pedido ${pedido.id} possui total ${pedido.totalPrice.toString()}.`,
      );

      throw new ServiceUnavailableException(
        'O valor reembolsado não corresponde ao valor total do pedido.',
      );
    }

    await this.prisma.pagamento.update({
      where: {
        id: pagamento.id,
      },
      data: {
        refundId: refund.refundId,
        refundStatus: refund.status,
        refundAmount,
        refundedAt: refund.createdAt ?? new Date(),
      },
    });

    await this.pedidosService.finalizarCancelamentoReembolsado(pedido.id);

    return {
      pedidoId: pedido.id,
      status: StatusPedido.CANCELADO,
      refunded: true,
      refundId: refund.refundId,
      refundAmount: Number(refundAmount),
    };
  }
}
