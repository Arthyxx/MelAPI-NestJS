import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusPedido } from '@prisma/client';

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

    if (pedido.items.length === 0) {
      throw new BadRequestException(
        'Este pedido não possui produtos para pagamento.',
      );
    }

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

    const preference = await this.mercadoPagoService.criarPreferencia({
      pedidoId: pedido.id,

      clienteId: pedido.clienteId,

      clienteEmail: pedido.cliente.email,

      items,
    });

    await this.prisma.pagamento.create({
      data: {
        pedidoId: pedido.id,

        provider: 'MERCADO_PAGO',

        preferenceId: preference.preferenceId,

        status: 'pending',
      },
    });

    return {
      pedidoId: pedido.id,

      preferenceId: preference.preferenceId,

      checkoutUrl: preference.checkoutUrl,
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
