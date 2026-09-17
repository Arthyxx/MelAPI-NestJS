import {
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
export class ReembolsoWebhookService {
  private readonly logger = new Logger(ReembolsoWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly pedidosService: PedidosService,
  ) {}

  async reconciliarPagamentoReembolsado(
    pagamentoId: number,
    pedidoId: number,
    totalPrice: Prisma.Decimal,
    paymentId: string,
  ) {
    const refunds = await this.mercadoPagoService.listarReembolsos(paymentId);

    const approvedRefunds = refunds.filter(
      (refund) => refund.status === 'approved',
    );

    if (approvedRefunds.length !== 1) {
      this.logger.error(
        `Pagamento ${paymentId} está reembolsado, mas foram encontrados ${approvedRefunds.length} reembolsos aprovados.`,
      );

      throw new ServiceUnavailableException(
        'Não foi possível confirmar o reembolso total do pagamento.',
      );
    }

    const refund = approvedRefunds[0];

    if (!refund) {
      throw new ServiceUnavailableException(
        'Não foi possível confirmar o reembolso total do pagamento.',
      );
    }

    const refundAmount = new Prisma.Decimal(refund.amount);

    if (!refundAmount.equals(totalPrice)) {
      this.logger.error(
        `Reembolso ${refund.refundId} possui valor ${refundAmount.toString()}, mas o pedido ${pedidoId} possui total ${totalPrice.toString()}.`,
      );

      throw new ServiceUnavailableException(
        'O valor reembolsado não corresponde ao valor total do pedido.',
      );
    }

    await this.prisma.pagamento.update({
      where: {
        id: pagamentoId,
      },
      data: {
        refundId: refund.refundId,
        refundStatus: refund.status,
        refundAmount,
        refundedAt: refund.createdAt ?? new Date(),
      },
    });

    const pedidoAtual = await this.prisma.pedido.findUnique({
      where: {
        id: pedidoId,
      },
      select: {
        status: true,
        paidPaymentId: true,
      },
    });

    if (!pedidoAtual) {
      throw new NotFoundException(
        'Pedido associado ao pagamento não encontrado após a confirmação do reembolso.',
      );
    }

    if (pedidoAtual.paidPaymentId && pedidoAtual.paidPaymentId !== paymentId) {
      this.logger.log(
        `Reembolso do pagamento duplicado ${paymentId} do pedido ${pedidoId} foi reconciliado sem alterar o status do pedido.`,
      );

      return;
    }

    if (pedidoAtual.status === StatusPedido.CANCELADO) {
      return;
    }

    if (pedidoAtual.status === StatusPedido.CANCELAMENTO_PENDENTE) {
      await this.pedidosService.finalizarCancelamentoReembolsado(pedidoId);
      return;
    }

    if (
      pedidoAtual.status !== StatusPedido.PAGO &&
      pedidoAtual.status !== StatusPedido.CONFIRMADO &&
      pedidoAtual.status !== StatusPedido.PREPARANDO
    ) {
      this.logger.error(
        `Pagamento ${paymentId} do pedido ${pedidoId} foi reembolsado enquanto o pedido estava em ${pedidoAtual.status}.`,
      );

      throw new ConflictException(
        'O pagamento foi reembolsado, mas o status atual do pedido exige conciliação manual.',
      );
    }

    await this.pedidosService.iniciarCancelamentoComReembolso(pedidoId);
    await this.pedidosService.finalizarCancelamentoReembolsado(pedidoId);
  }

  async reembolsarPagamentoAprovadoDuplicado(
    pagamentoId: number,
    pedidoId: number,
    totalPrice: Prisma.Decimal,
    paymentId: string,
    paidPaymentId: string,
  ) {
    const pagamento = await this.prisma.pagamento.findUnique({
      where: {
        id: pagamentoId,
      },
    });

    if (
      pagamento?.refundStatus === 'approved' &&
      pagamento.refundId &&
      pagamento.refundAmount !== null
    ) {
      return;
    }

    this.logger.warn(
      `Pagamento duplicado ${paymentId} foi aprovado para o pedido ${pedidoId}, que já foi pago por ${paidPaymentId}. Iniciando reembolso automático.`,
    );

    const refund = await this.mercadoPagoService.reembolsarPagamento(paymentId);

    if (refund.status !== 'approved') {
      this.logger.error(
        `Reembolso automático ${refund.refundId} do pagamento duplicado ${paymentId} retornou status ${refund.status}.`,
      );

      throw new ServiceUnavailableException(
        'O Mercado Pago ainda não confirmou o reembolso automático da cobrança duplicada.',
      );
    }

    const refundAmount = new Prisma.Decimal(refund.amount);

    if (!refundAmount.equals(totalPrice)) {
      this.logger.error(
        `Reembolso automático ${refund.refundId} do pagamento duplicado ${paymentId} possui valor ${refundAmount.toString()}, mas o pedido ${pedidoId} possui total ${totalPrice.toString()}.`,
      );

      throw new ServiceUnavailableException(
        'O valor do reembolso automático da cobrança duplicada não corresponde ao valor do pedido.',
      );
    }

    await this.prisma.pagamento.update({
      where: {
        id: pagamentoId,
      },
      data: {
        refundId: refund.refundId,
        refundStatus: refund.status,
        refundAmount,
        refundedAt: refund.createdAt ?? new Date(),
      },
    });

    this.logger.log(
      `Pagamento duplicado ${paymentId} do pedido ${pedidoId} foi reembolsado automaticamente.`,
    );
  }

  async reembolsarPagamentoAprovadoDePedidoCancelado(
    pagamentoId: number,
    pedidoId: number,
    totalPrice: Prisma.Decimal,
    paymentId: string,
  ) {
    const pagamento = await this.prisma.pagamento.findUnique({
      where: {
        id: pagamentoId,
      },
    });

    if (
      pagamento?.refundStatus === 'approved' &&
      pagamento.refundId &&
      pagamento.refundAmount !== null
    ) {
      return;
    }

    this.logger.warn(
      `Pagamento ${paymentId} foi aprovado após o pedido ${pedidoId} já estar cancelado. Iniciando reembolso automático.`,
    );

    const refund = await this.mercadoPagoService.reembolsarPagamento(paymentId);

    if (refund.status !== 'approved') {
      this.logger.error(
        `Reembolso automático ${refund.refundId} do pagamento ${paymentId} retornou status ${refund.status}.`,
      );

      throw new ServiceUnavailableException(
        'O Mercado Pago ainda não confirmou o reembolso automático.',
      );
    }

    const refundAmount = new Prisma.Decimal(refund.amount);

    if (!refundAmount.equals(totalPrice)) {
      this.logger.error(
        `Reembolso automático ${refund.refundId} possui valor ${refundAmount.toString()}, mas o pedido ${pedidoId} possui total ${totalPrice.toString()}.`,
      );

      throw new ServiceUnavailableException(
        'O valor do reembolso automático não corresponde ao valor do pedido.',
      );
    }

    await this.prisma.pagamento.update({
      where: {
        id: pagamentoId,
      },
      data: {
        refundId: refund.refundId,
        refundStatus: refund.status,
        refundAmount,
        refundedAt: refund.createdAt ?? new Date(),
      },
    });

    this.logger.log(
      `Pagamento ${paymentId} do pedido cancelado ${pedidoId} foi reembolsado automaticamente.`,
    );
  }
}
