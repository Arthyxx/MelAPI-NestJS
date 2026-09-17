import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusPedido } from '@prisma/client';

import { PedidosService } from '../../pedidos/pedidos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MercadoPagoService } from '../mercado-pago.service';
import { ReembolsoWebhookService } from './reembolso-webhook.service';

@Injectable()
export class PagamentoWebhookService {
  private readonly logger = new Logger(PagamentoWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly pedidosService: PedidosService,
    private readonly reembolsoWebhookService: ReembolsoWebhookService,
  ) {}

  async processarPagamentoWebhook(paymentId: string) {
    const payment = await this.mercadoPagoService.buscarPagamento(paymentId);

    const pedidoId = this.resolvePedidoId(
      payment.pedidoId,
      payment.externalReference,
    );

    const pedido = await this.prisma.pedido.findUnique({
      where: {
        id: pedidoId,
      },
      select: {
        id: true,
        status: true,
        totalPrice: true,
        paidPaymentId: true,
      },
    });

    if (!pedido) {
      throw new NotFoundException(
        'Pedido associado ao pagamento não encontrado.',
      );
    }

    const amount = new Prisma.Decimal(payment.transactionAmount);

    if (!amount.equals(pedido.totalPrice)) {
      this.logger.error(
        `Pagamento ${payment.paymentId} possui valor ${amount.toString()}, mas o pedido ${pedido.id} possui total ${pedido.totalPrice.toString()}.`,
      );

      throw new BadRequestException(
        'O valor do pagamento não corresponde ao total do pedido.',
      );
    }

    const pagamentoExistente = await this.prisma.pagamento.findUnique({
      where: {
        paymentId: payment.paymentId,
      },
    });

    const tentativaPendente =
      pagamentoExistente ??
      (await this.prisma.pagamento.findFirst({
        where: {
          pedidoId: pedido.id,
          provider: 'MERCADO_PAGO',
          paymentId: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }));

    let pagamentoId: number;

    try {
      pagamentoId = await this.prisma.$transaction(async (tx) => {
        const paymentData = {
          paymentId: payment.paymentId,
          status: payment.status,
          statusDetail: payment.statusDetail,
          approvedAt: payment.approvedAt,
        };

        let registroPagamentoId: number;

        if (pagamentoExistente) {
          await tx.pagamento.update({
            where: {
              id: pagamentoExistente.id,
            },
            data: paymentData,
          });

          registroPagamentoId = pagamentoExistente.id;
        } else if (tentativaPendente) {
          const tentativaAssumida = await tx.pagamento.updateMany({
            where: {
              id: tentativaPendente.id,
              paymentId: null,
            },
            data: paymentData,
          });

          if (tentativaAssumida.count === 1) {
            registroPagamentoId = tentativaPendente.id;
          } else {
            const pagamentoCriadoPorOutraOperacao =
              await tx.pagamento.findUnique({
                where: {
                  paymentId: payment.paymentId,
                },
              });

            if (pagamentoCriadoPorOutraOperacao) {
              await tx.pagamento.update({
                where: {
                  id: pagamentoCriadoPorOutraOperacao.id,
                },
                data: paymentData,
              });

              registroPagamentoId = pagamentoCriadoPorOutraOperacao.id;
            } else {
              const novoPagamento = await tx.pagamento.create({
                data: {
                  pedidoId: pedido.id,
                  provider: 'MERCADO_PAGO',
                  ...paymentData,
                },
              });

              registroPagamentoId = novoPagamento.id;
            }
          }
        } else {
          // Cada nova tentativa recebe seu próprio registro.
          // preferenceId permanece no registro original, pois é único.
          const novoPagamento = await tx.pagamento.create({
            data: {
              pedidoId: pedido.id,
              provider: 'MERCADO_PAGO',
              ...paymentData,
            },
          });

          registroPagamentoId = novoPagamento.id;
        }

        if (
          payment.status === 'approved' &&
          pedido.status === StatusPedido.PENDENTE
        ) {
          const statusUpdate = await tx.pedido.updateMany({
            where: {
              id: pedido.id,
              status: StatusPedido.PENDENTE,
            },
            data: {
              status: StatusPedido.PAGO,
              paidPaymentId: payment.paymentId,
            },
          });

          if (statusUpdate.count !== 1) {
            this.logger.warn(
              `Pedido ${pedido.id} mudou de status durante a confirmação do pagamento ${payment.paymentId}.`,
            );
          }
        }

        return registroPagamentoId;
      });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
      ) {
        throw error;
      }

      const pagamentoConcorrente = await this.prisma.pagamento.findUnique({
        where: {
          paymentId: payment.paymentId,
        },
      });

      if (!pagamentoConcorrente) {
        throw error;
      }

      if (pagamentoConcorrente.pedidoId !== pedido.id) {
        this.logger.error(
          `Pagamento ${payment.paymentId} já está associado ao pedido ${pagamentoConcorrente.pedidoId}, mas o webhook informou o pedido ${pedido.id}.`,
        );

        throw new BadRequestException(
          'O pagamento informado já está associado a outro pedido.',
        );
      }

      pagamentoId = pagamentoConcorrente.id;

      this.logger.log(
        `Webhook concorrente do pagamento ${payment.paymentId} reutilizou o registro ${pagamentoId}.`,
      );
    }

    if (payment.status === 'approved') {
      const pedidoAtual = await this.prisma.pedido.findUnique({
        where: {
          id: pedido.id,
        },
        select: {
          status: true,
          paidPaymentId: true,
        },
      });

      if (!pedidoAtual) {
        throw new NotFoundException(
          'Pedido associado ao pagamento não encontrado após a atualização.',
        );
      }

      if (pedidoAtual.status === StatusPedido.CANCELADO) {
        await this.reembolsoWebhookService.reembolsarPagamentoAprovadoDePedidoCancelado(
          pagamentoId,
          pedido.id,
          pedido.totalPrice,
          payment.paymentId,
        );
      } else if (
        pedidoAtual.paidPaymentId &&
        pedidoAtual.paidPaymentId !== payment.paymentId
      ) {
        await this.reembolsoWebhookService.reembolsarPagamentoAprovadoDuplicado(
          pagamentoId,
          pedido.id,
          pedido.totalPrice,
          payment.paymentId,
          pedidoAtual.paidPaymentId,
        );
      } else if (!pedidoAtual.paidPaymentId) {
        this.logger.error(
          `Pagamento ${payment.paymentId} foi aprovado para o pedido ${pedido.id}, mas o pedido não possui paidPaymentId definido após o processamento.`,
        );

        throw new ConflictException(
          'O pagamento foi aprovado, mas não foi possível determinar com segurança a cobrança oficial do pedido.',
        );
      }
    }

    if (payment.status === 'refunded') {
      await this.reembolsoWebhookService.reconciliarPagamentoReembolsado(
        pagamentoId,
        pedido.id,
        pedido.totalPrice,
        payment.paymentId,
      );
    }

    return {
      received: true,
      pedidoId: pedido.id,
      paymentId: payment.paymentId,
      paymentStatus: payment.status,
    };
  }

  private resolvePedidoId(
    metadataPedidoId: number | null,
    externalReference: string | null,
  ) {
    const referencePedidoId =
      externalReference && /^\d+$/.test(externalReference)
        ? Number(externalReference)
        : null;

    if (
      metadataPedidoId !== null &&
      referencePedidoId !== null &&
      metadataPedidoId !== referencePedidoId
    ) {
      throw new BadRequestException(
        'Os dados do pagamento não correspondem ao mesmo pedido.',
      );
    }

    const pedidoId = metadataPedidoId ?? referencePedidoId;

    if (pedidoId === null || !Number.isInteger(pedidoId) || pedidoId <= 0) {
      throw new BadRequestException(
        'O pagamento não possui um pedido válido associado.',
      );
    }

    return pedidoId;
  }
}
