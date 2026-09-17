import { Prisma, StatusPedido } from '@prisma/client';

import { PedidosService } from '../pedidos/pedidos.service';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from './mercado-pago.service';
import { PagamentosService } from './pagamentos.service';

describe('PagamentosService — nova tentativa de pagamento', () => {
  it('deve reconhecer uma nova tentativa aprovada sem sobrescrever a recusada', async () => {
    const approvedAt = new Date('2026-09-15T12:00:00.000Z');

    const pagamentoRecusado = {
      id: 10,
      pedidoId: 1,
      provider: 'MERCADO_PAGO',
      preferenceId: 'preference-1',
      paymentId: 'payment-rejected',
      status: 'rejected',
    };

    const pedido = {
      id: 1,
      status: StatusPedido.PENDENTE,
      totalPrice: new Prisma.Decimal('75.00'),
      paidPaymentId: null,
    };

    const pagamentoAprovado = {
      id: 11,
      pedidoId: 1,
      provider: 'MERCADO_PAGO',
      paymentId: 'payment-approved',
      status: 'approved',
    };

    const tx = {
      pagamento: {
        create: jest.fn().mockResolvedValue(pagamentoAprovado),
        update: jest.fn().mockResolvedValue(pagamentoAprovado),
      },
      pedido: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const prisma = {
      pedido: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(pedido)
          .mockResolvedValue({
            ...pedido,
            status: StatusPedido.PAGO,
            paidPaymentId: pagamentoAprovado.paymentId,
          }),
      },
      pagamento: {
        // O novo paymentId ainda não existe no banco.
        findUnique: jest.fn().mockResolvedValue(null),

        // A tentativa anterior já recebeu o ID do pagamento recusado.
        // Não existe registro com paymentId vazio.
        findFirst: jest.fn().mockResolvedValue(null),

        create: tx.pagamento.create,
        update: tx.pagamento.update,
      },
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const mercadoPagoService = {
      buscarPagamento: jest.fn().mockResolvedValue({
        paymentId: pagamentoAprovado.paymentId,
        status: 'approved',
        statusDetail: 'accredited',
        externalReference: '1',
        transactionAmount: 75,
        approvedAt,
        pedidoId: 1,
      }),
      reembolsarPagamento: jest.fn(),
    };

    const service = new PagamentosService(
      prisma as unknown as PrismaService,
      mercadoPagoService as unknown as MercadoPagoService,
      {} as PedidosService,
    );

    await expect(
      service.processarPagamentoWebhook(pagamentoAprovado.paymentId),
    ).resolves.toMatchObject({
      received: true,
      pedidoId: 1,
      paymentId: pagamentoAprovado.paymentId,
      paymentStatus: 'approved',
    });

    expect(tx.pagamento.create).toHaveBeenCalledTimes(1);

    expect(tx.pagamento.create).toHaveBeenCalledWith({
      data: {
        pedidoId: 1,
        provider: 'MERCADO_PAGO',
        paymentId: pagamentoAprovado.paymentId,
        status: 'approved',
        statusDetail: 'accredited',
        approvedAt,
      },
    });

    expect(tx.pagamento.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pagamentoRecusado.id },
      }),
    );

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        status: StatusPedido.PENDENTE,
      },
      data: {
        status: StatusPedido.PAGO,
        paidPaymentId: pagamentoAprovado.paymentId,
      },
    });

    expect(mercadoPagoService.reembolsarPagamento).not.toHaveBeenCalled();
  });
});
