import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusCheckoutPedido, StatusPedido } from '@prisma/client';

import { PedidosService } from '../../pedidos/pedidos.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MercadoPagoPreferenceInput,
  MercadoPagoService,
} from '../mercado-pago.service';

const CHECKOUT_CREATION_STALE_MS = 2 * 60_000;

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

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

    const checkoutReservationToken = await this.reservarCriacaoCheckout(
      pedido.id,
    );

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
        try {
          await tx.checkoutPedido.update({
            where: {
              pedidoId: pedido.id,
              status: StatusCheckoutPedido.CRIANDO,
              updatedAt: checkoutReservationToken,
            },
            data: {
              status: StatusCheckoutPedido.PRONTO,
              preferenceId: preference.preferenceId,
              checkoutUrl: preference.checkoutUrl,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2025'
          ) {
            throw new ConflictException(
              'A criação do checkout foi assumida por outra tentativa. Tente novamente.',
            );
          }

          throw error;
        }

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
      await this.marcarCheckoutComoFalhou(pedido.id, checkoutReservationToken);

      throw error;
    }
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

  private async reservarCriacaoCheckout(pedidoId: number): Promise<Date> {
    const checkoutExistente = await this.prisma.checkoutPedido.findUnique({
      where: {
        pedidoId,
      },
    });

    const reservationToken = new Date();

    if (checkoutExistente?.status === StatusCheckoutPedido.CRIANDO) {
      const staleBefore = new Date(Date.now() - CHECKOUT_CREATION_STALE_MS);

      if (checkoutExistente.updatedAt > staleBefore) {
        throw new ConflictException(
          'O checkout deste pedido já está sendo criado. Tente novamente em instantes.',
        );
      }

      const update = await this.prisma.checkoutPedido.updateMany({
        where: {
          pedidoId,
          status: StatusCheckoutPedido.CRIANDO,
          updatedAt: checkoutExistente.updatedAt,
        },
        data: {
          preferenceId: null,
          checkoutUrl: null,
          updatedAt: reservationToken,
        },
      });

      if (update.count === 1) {
        this.logger.warn(
          `Checkout CRIANDO antigo do pedido ${pedidoId} foi recuperado para uma nova tentativa.`,
        );

        return reservationToken;
      }

      throw new ConflictException(
        'O checkout deste pedido está sendo atualizado por outra operação.',
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
          updatedAt: reservationToken,
        },
      });

      if (update.count === 1) {
        return reservationToken;
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
          updatedAt: reservationToken,
        },
      });

      return reservationToken;
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

  private async marcarCheckoutComoFalhou(
    pedidoId: number,
    reservationToken: Date,
  ) {
    try {
      await this.prisma.checkoutPedido.updateMany({
        where: {
          pedidoId,
          status: StatusCheckoutPedido.CRIANDO,
          updatedAt: reservationToken,
        },
        data: {
          status: StatusCheckoutPedido.FALHOU,
        },
      });
    } catch (error) {
      const errorType = error instanceof Error ? error.name : 'desconhecido';

      this.logger.error(
        `Não foi possível marcar o checkout do pedido ${pedidoId} como falho. Tipo: ${errorType}.`,
      );
    }
  }
}
