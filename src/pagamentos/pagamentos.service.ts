import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, StatusCheckoutPedido, StatusPedido } from '@prisma/client';

import { PedidosService } from '../pedidos/pedidos.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MercadoPagoPreferenceInput,
  MercadoPagoService,
} from './mercado-pago.service';

@Injectable()
export class PagamentosService {
  private readonly logger = new Logger(PagamentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly pedidosService: PedidosService,
  ) {}

  async iniciarPagamento(clienteId: number, pedidoId: number) {
    const pedido = await this.prisma.pedido.findFirst({
      where: {
        id: pedidoId,
        clienteId,
      },

      include: {
        cliente: {
          select: {
            id: true,
            email: true,
          },
        },

        items: {
          include: {
            produto: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!pedido) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (pedido.status !== StatusPedido.PENDENTE) {
      throw new BadRequestException(
        'Este pedido não está disponível para pagamento.',
      );
    }

    const paymentExpiresAt = pedido.paymentExpiresAt;

    if (!paymentExpiresAt) {
      throw new BadRequestException(
        'Este pedido não possui prazo de pagamento válido.',
      );
    }

    if (paymentExpiresAt.getTime() <= Date.now()) {
      await this.pedidosService.expirarPedidoPendente(pedido.id);

      throw new BadRequestException(
        'O prazo para pagamento deste pedido expirou.',
      );
    }

    if (pedido.items.length === 0) {
      throw new BadRequestException(
        'Este pedido não possui produtos para pagamento.',
      );
    }

    const checkoutPronto = await this.getCheckoutPronto(pedido.id);

    if (checkoutPronto) {
      return checkoutPronto;
    }

    await this.reservarCriacaoCheckout(pedido.id);

    const items: MercadoPagoPreferenceInput['items'] = pedido.items.map(
      (item) => ({
        id: String(item.produtoId),
        title: item.produto.name,
        quantity: item.quantity,
        currency_id: 'BRL',
        unit_price: Number(item.unitPrice),
      }),
    );

    const shippingPrice = Number(pedido.shippingPrice);

    if (shippingPrice > 0) {
      items.push({
        id: `frete-${pedido.id}`,

        title: pedido.shippingServiceName
          ? `Frete - ${pedido.shippingServiceName}`
          : 'Frete',

        quantity: 1,
        currency_id: 'BRL',
        unit_price: shippingPrice,
      });
    }

    try {
      const preference = await this.mercadoPagoService.criarPreferencia({
        pedidoId: pedido.id,
        clienteId: pedido.clienteId,
        clienteEmail: pedido.cliente.email,
        paymentExpiresAt,
        items,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.checkoutPedido.update({
          where: {
            pedidoId: pedido.id,
          },

          data: {
            status: StatusCheckoutPedido.PRONTO,
            preferenceId: preference.preferenceId,
            checkoutUrl: preference.checkoutUrl,
          },
        });

        const pagamentoExistente = await tx.pagamento.findUnique({
          where: {
            preferenceId: preference.preferenceId,
          },
        });

        if (!pagamentoExistente) {
          await tx.pagamento.create({
            data: {
              pedidoId: pedido.id,
              provider: 'MERCADO_PAGO',
              preferenceId: preference.preferenceId,
              status: 'pending',
            },
          });
        }
      });

      return {
        pedidoId: pedido.id,
        preferenceId: preference.preferenceId,
        checkoutUrl: preference.checkoutUrl,
      };
    } catch (error) {
      await this.marcarCheckoutComoFalhou(pedido.id);

      throw error;
    }
  }

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
            status: 'approved',

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

    if (!tentativaPendente) {
      throw new NotFoundException('Tentativa de pagamento não encontrada.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pagamento.update({
        where: {
          id: tentativaPendente.id,
        },

        data: {
          paymentId: payment.paymentId,
          status: payment.status,
          statusDetail: payment.statusDetail,
          approvedAt: payment.approvedAt,
        },
      });

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
          },
        });

        if (statusUpdate.count !== 1) {
          this.logger.warn(
            `Pedido ${pedido.id} mudou de status durante a confirmação do pagamento ${payment.paymentId}.`,
          );
        }
      }
    });

    if (payment.status === 'approved') {
      const pedidoAtual = await this.prisma.pedido.findUnique({
        where: {
          id: pedido.id,
        },

        select: {
          status: true,
        },
      });

      if (!pedidoAtual) {
        throw new NotFoundException(
          'Pedido associado ao pagamento não encontrado após a atualização.',
        );
      }

      if (pedidoAtual.status === StatusPedido.CANCELADO) {
        await this.reembolsarPagamentoAprovadoDePedidoCancelado(
          tentativaPendente.id,
          pedido.id,
          pedido.totalPrice,
          payment.paymentId,
        );
      }
    }

    return {
      received: true,
      pedidoId: pedido.id,
      paymentId: payment.paymentId,
      paymentStatus: payment.status,
    };
  }

  private async reembolsarPagamentoAprovadoDePedidoCancelado(
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

  private async getCheckoutPronto(pedidoId: number) {
    const checkout = await this.prisma.checkoutPedido.findUnique({
      where: {
        pedidoId,
      },
    });

    if (
      checkout?.status !== StatusCheckoutPedido.PRONTO ||
      !checkout.preferenceId ||
      !checkout.checkoutUrl
    ) {
      return null;
    }

    return {
      pedidoId,
      preferenceId: checkout.preferenceId,
      checkoutUrl: checkout.checkoutUrl,
    };
  }

  private async reservarCriacaoCheckout(pedidoId: number) {
    const checkoutExistente = await this.prisma.checkoutPedido.findUnique({
      where: {
        pedidoId,
      },
    });

    if (checkoutExistente?.status === StatusCheckoutPedido.CRIANDO) {
      throw new ConflictException(
        'O checkout deste pedido já está sendo criado. Tente novamente em instantes.',
      );
    }

    if (checkoutExistente?.status === StatusCheckoutPedido.PRONTO) {
      throw new ConflictException(
        'Este pedido já possui um checkout disponível.',
      );
    }

    if (checkoutExistente?.status === StatusCheckoutPedido.FALHOU) {
      const update = await this.prisma.checkoutPedido.updateMany({
        where: {
          pedidoId,
          status: StatusCheckoutPedido.FALHOU,
        },

        data: {
          status: StatusCheckoutPedido.CRIANDO,
          preferenceId: null,
          checkoutUrl: null,
        },
      });

      if (update.count === 1) {
        return;
      }

      throw new ConflictException(
        'O checkout deste pedido está sendo atualizado por outra operação.',
      );
    }

    try {
      await this.prisma.checkoutPedido.create({
        data: {
          pedidoId,
          provider: 'MERCADO_PAGO',
          status: StatusCheckoutPedido.CRIANDO,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const checkoutPronto = await this.getCheckoutPronto(pedidoId);

        if (checkoutPronto) {
          throw new ConflictException(
            'Este pedido já possui um checkout disponível.',
          );
        }

        throw new ConflictException(
          'O checkout deste pedido já está sendo criado. Tente novamente em instantes.',
        );
      }

      throw error;
    }
  }

  private async marcarCheckoutComoFalhou(pedidoId: number) {
    try {
      await this.prisma.checkoutPedido.updateMany({
        where: {
          pedidoId,
          status: StatusCheckoutPedido.CRIANDO,
        },

        data: {
          status: StatusCheckoutPedido.FALHOU,
        },
      });
    } catch (error) {
      this.logger.error(
        `Não foi possível marcar o checkout do pedido ${pedidoId} como falho.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
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
