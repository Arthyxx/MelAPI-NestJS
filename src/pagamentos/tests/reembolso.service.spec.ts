import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, StatusPedido } from '@prisma/client';

import { PedidosService } from '../../pedidos/pedidos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MercadoPagoService } from '../mercado-pago.service';
import { ReembolsoService } from '../services/reembolso.service';

describe('ReembolsoService', () => {
  let service: ReembolsoService;

  let prisma: {
    pedido: {
      findUnique: jest.Mock;
    };
    pagamento: {
      update: jest.Mock;
    };
  };

  const mercadoPagoService = {
    reembolsarPagamento: jest.fn(),
  };

  const pedidosService = {
    iniciarCancelamentoComReembolso: jest.fn(),
    finalizarCancelamentoReembolsado: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      pedido: {
        findUnique: jest.fn(),
      },
      pagamento: {
        update: jest.fn(),
      },
    };

    service = new ReembolsoService(
      prisma as unknown as PrismaService,
      mercadoPagoService as unknown as MercadoPagoService,
      pedidosService as unknown as PedidosService,
    );
  });

  it('deve reembolsar pagamento aprovado e finalizar cancelamento', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      totalPrice: new Prisma.Decimal('75.00'),

      pagamentos: [
        {
          id: 10,
          pedidoId: 1,
          provider: 'MERCADO_PAGO',
          preferenceId: 'pref-123',
          paymentId: 'pay-123',
          status: 'approved',
          statusDetail: 'accredited',
          approvedAt: new Date(),
          refundId: null,
          refundStatus: null,
          refundAmount: null,
          refundedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    mercadoPagoService.reembolsarPagamento.mockResolvedValue({
      refundId: 'refund-123',
      paymentId: 'pay-123',
      amount: 75,
      status: 'approved',
      createdAt: new Date('2026-09-08T12:00:00.000Z'),
    });

    prisma.pagamento.update.mockResolvedValue({});

    pedidosService.iniciarCancelamentoComReembolso.mockResolvedValue(undefined);
    pedidosService.finalizarCancelamentoReembolsado.mockResolvedValue(
      undefined,
    );

    const result = await service.cancelarPedidoComReembolso(1);

    expect(pedidosService.iniciarCancelamentoComReembolso).toHaveBeenCalledWith(
      1,
    );

    expect(mercadoPagoService.reembolsarPagamento).toHaveBeenCalledWith(
      'pay-123',
    );

    expect(prisma.pagamento.update).toHaveBeenCalledWith({
      where: {
        id: 10,
      },
      data: {
        refundId: 'refund-123',
        refundStatus: 'approved',
        refundAmount: new Prisma.Decimal('75'),
        refundedAt: new Date('2026-09-08T12:00:00.000Z'),
      },
    });

    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).toHaveBeenCalledWith(1);

    expect(result).toEqual({
      pedidoId: 1,
      status: StatusPedido.CANCELADO,
      refunded: true,
      refundId: 'refund-123',
      refundAmount: 75,
    });
  });

  it('deve retornar os dados reais do reembolso quando pedido já estiver cancelado e reembolsado', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.CANCELADO,
      totalPrice: new Prisma.Decimal('75.00'),

      pagamentos: [
        {
          id: 10,
          paymentId: 'pay-123',
          status: 'approved',
          refundId: 'refund-123',
          refundStatus: 'approved',
          refundAmount: new Prisma.Decimal('75.00'),
          refundedAt: new Date(),
        },
      ],
    });

    const result = await service.cancelarPedidoComReembolso(1);

    expect(result).toEqual({
      pedidoId: 1,
      status: StatusPedido.CANCELADO,
      refunded: true,
      refundId: 'refund-123',
      refundAmount: 75,
    });

    expect(mercadoPagoService.reembolsarPagamento).not.toHaveBeenCalled();
    expect(
      pedidosService.iniciarCancelamentoComReembolso,
    ).not.toHaveBeenCalled();
    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).not.toHaveBeenCalled();
  });

  it('não deve informar reembolso quando pedido cancelado não possuir pagamento aprovado', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.CANCELADO,
      totalPrice: new Prisma.Decimal('75.00'),
      pagamentos: [],
    });

    await expect(service.cancelarPedidoComReembolso(1)).rejects.toThrow(
      new BadRequestException(
        'Este pedido já está cancelado e não possui pagamento aprovado para reembolso.',
      ),
    );

    expect(mercadoPagoService.reembolsarPagamento).not.toHaveBeenCalled();
    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).not.toHaveBeenCalled();
  });

  it('não deve informar reembolso quando pedido cancelado possuir pagamento aprovado sem reembolso confirmado', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.CANCELADO,
      totalPrice: new Prisma.Decimal('75.00'),

      pagamentos: [
        {
          id: 10,
          paymentId: 'pay-123',
          status: 'approved',
          refundId: null,
          refundStatus: null,
          refundAmount: null,
        },
      ],
    });

    await expect(service.cancelarPedidoComReembolso(1)).rejects.toThrow(
      new ConflictException(
        'Este pedido já está cancelado, mas não possui reembolso aprovado registrado.',
      ),
    );

    expect(mercadoPagoService.reembolsarPagamento).not.toHaveBeenCalled();
    expect(
      pedidosService.iniciarCancelamentoComReembolso,
    ).not.toHaveBeenCalled();
    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).not.toHaveBeenCalled();
  });

  it('não deve cancelar pedido quando o Mercado Pago não confirmar o reembolso', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      totalPrice: new Prisma.Decimal('75.00'),

      pagamentos: [
        {
          id: 10,
          paymentId: 'pay-123',
          status: 'approved',
          refundId: null,
          refundStatus: null,
          refundAmount: null,
        },
      ],
    });

    mercadoPagoService.reembolsarPagamento.mockResolvedValue({
      refundId: 'refund-123',
      paymentId: 'pay-123',
      amount: 75,
      status: 'pending',
      createdAt: new Date(),
    });

    await expect(service.cancelarPedidoComReembolso(1)).rejects.toThrow(
      new ServiceUnavailableException(
        'O Mercado Pago ainda não confirmou o reembolso.',
      ),
    );

    expect(pedidosService.iniciarCancelamentoComReembolso).toHaveBeenCalledWith(
      1,
    );
    expect(prisma.pagamento.update).not.toHaveBeenCalled();
    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).not.toHaveBeenCalled();
  });

  it('não deve finalizar cancelamento quando valor reembolsado for diferente do pedido', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      totalPrice: new Prisma.Decimal('75.00'),

      pagamentos: [
        {
          id: 10,
          paymentId: 'pay-123',
          status: 'approved',
          refundId: null,
          refundStatus: null,
          refundAmount: null,
        },
      ],
    });

    mercadoPagoService.reembolsarPagamento.mockResolvedValue({
      refundId: 'refund-123',
      paymentId: 'pay-123',
      amount: 50,
      status: 'approved',
      createdAt: new Date(),
    });

    await expect(service.cancelarPedidoComReembolso(1)).rejects.toThrow(
      new ServiceUnavailableException(
        'O valor reembolsado não corresponde ao valor total do pedido.',
      ),
    );

    expect(prisma.pagamento.update).not.toHaveBeenCalled();
    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).not.toHaveBeenCalled();
  });

  it('deve reutilizar reembolso já aprovado sem chamar Mercado Pago novamente', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.CANCELAMENTO_PENDENTE,
      totalPrice: new Prisma.Decimal('75.00'),

      pagamentos: [
        {
          id: 10,
          paymentId: 'pay-123',
          status: 'approved',
          refundId: 'refund-123',
          refundStatus: 'approved',
          refundAmount: new Prisma.Decimal('75.00'),
          refundedAt: new Date(),
        },
      ],
    });

    pedidosService.finalizarCancelamentoReembolsado.mockResolvedValue(
      undefined,
    );

    const result = await service.cancelarPedidoComReembolso(1);

    expect(mercadoPagoService.reembolsarPagamento).not.toHaveBeenCalled();
    expect(
      pedidosService.finalizarCancelamentoReembolsado,
    ).toHaveBeenCalledWith(1);

    expect(result).toEqual({
      pedidoId: 1,
      status: StatusPedido.CANCELADO,
      refunded: true,
      refundId: 'refund-123',
      refundAmount: 75,
    });
  });
});
