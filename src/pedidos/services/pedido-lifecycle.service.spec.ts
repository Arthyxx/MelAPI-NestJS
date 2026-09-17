import { BadRequestException } from '@nestjs/common';
import { StatusPedido } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { PedidoLifecycleService } from './pedido-lifecycle.service';
import { PedidoQueryService } from './pedido-query.service';

describe('PedidoLifecycleService', () => {
  let service: PedidoLifecycleService;

  let prisma: {
    pedido: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const pedidoQueryService = {
    findById: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      pedido: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    service = new PedidoLifecycleService(
      prisma as unknown as PrismaService,
      pedidoQueryService as unknown as PedidoQueryService,
    );
  });

  it('deve rejeitar uma transição de status não permitida', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.ENVIADO,
      items: [
        {
          produtoId: 10,
          quantity: 1,
        },
      ],
    });

    await expect(
      service.updateStatus(1, {
        status: StatusPedido.CANCELADO,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Não é permitido alterar o pedido de ENVIADO para CANCELADO.',
      ),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deve impedir cancelamento direto de pedido pago', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      items: [
        {
          produtoId: 10,
          quantity: 1,
        },
      ],
    });

    await expect(
      service.updateStatus(1, {
        status: StatusPedido.CANCELADO,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Não é permitido alterar o pedido de PAGO para CANCELADO.',
      ),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deve impedir atualização quando o status mudar por outra operação', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
      items: [
        {
          produtoId: 10,
          quantity: 2,
        },
      ],
    });

    const tx = {
      pedido: {
        updateMany: jest.fn().mockResolvedValue({
          count: 0,
        }),
        findUnique: jest.fn(),
      },
      produto: {
        update: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    await expect(
      service.updateStatus(1, {
        status: StatusPedido.CONFIRMADO,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'O status deste pedido foi alterado por outra operação. Atualize a página e tente novamente.',
      ),
    );

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        status: StatusPedido.PAGO,
      },
      data: {
        status: StatusPedido.CONFIRMADO,
      },
    });
    expect(tx.produto.update).not.toHaveBeenCalled();
    expect(tx.pedido.findUnique).not.toHaveBeenCalled();
  });

  it('deve reservar pedido pago para cancelamento com reembolso', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PAGO,
    });

    prisma.pedido.updateMany.mockResolvedValue({
      count: 1,
    });

    await service.iniciarCancelamentoComReembolso(1);

    expect(prisma.pedido.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        status: StatusPedido.PAGO,
      },
      data: {
        status: StatusPedido.CANCELAMENTO_PENDENTE,
      },
    });
  });

  it('deve rejeitar reembolso de pedido já enviado', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.ENVIADO,
    });

    await expect(service.iniciarCancelamentoComReembolso(1)).rejects.toThrow(
      new BadRequestException(
        'Este pedido não pode ser cancelado com reembolso.',
      ),
    );

    expect(prisma.pedido.updateMany).not.toHaveBeenCalled();
  });

  it('deve devolver o estoque exatamente uma vez após o reembolso', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.CANCELAMENTO_PENDENTE,
      items: [
        {
          produtoId: 10,
          quantity: 2,
        },
        {
          produtoId: 11,
          quantity: 1,
        },
      ],
    });

    pedidoQueryService.findById.mockResolvedValue({
      id: 1,
      status: StatusPedido.CANCELADO,
      totalPrice: 75,
    });

    const tx = {
      pedido: {
        updateMany: jest.fn().mockResolvedValue({
          count: 1,
        }),
      },
      produto: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    const result = await service.finalizarCancelamentoReembolsado(1);

    expect(tx.pedido.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        status: StatusPedido.CANCELAMENTO_PENDENTE,
      },
      data: {
        status: StatusPedido.CANCELADO,
      },
    });

    expect(tx.produto.update).toHaveBeenCalledTimes(2);
    expect(tx.produto.update).toHaveBeenNthCalledWith(1, {
      where: {
        id: 10,
      },
      data: {
        stockQuantity: {
          increment: 2,
        },
      },
    });
    expect(tx.produto.update).toHaveBeenNthCalledWith(2, {
      where: {
        id: 11,
      },
      data: {
        stockQuantity: {
          increment: 1,
        },
      },
    });

    expect(pedidoQueryService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      id: 1,
      status: StatusPedido.CANCELADO,
      totalPrice: 75,
    });
  });

  it('deve expirar pedido pendente vencido e devolver estoque', async () => {
    prisma.pedido.findUnique.mockResolvedValue({
      id: 1,
      status: StatusPedido.PENDENTE,
      paymentExpiresAt: new Date(Date.now() - 60_000),
      items: [
        {
          produtoId: 10,
          quantity: 2,
        },
      ],
    });

    const tx = {
      pedido: {
        updateMany: jest.fn().mockResolvedValue({
          count: 1,
        }),
      },
      produto: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    await expect(service.expirarPedidoPendente(1)).resolves.toBe(true);

    expect(tx.pedido.updateMany).toHaveBeenCalledTimes(1);

    const updateManyCalls = tx.pedido.updateMany.mock.calls as Array<
      [
        {
          where: {
            id: number;
            status: StatusPedido;
            paymentExpiresAt: {
              lte: Date;
            };
          };
          data: {
            status: StatusPedido;
          };
        },
      ]
    >;

    const updateManyCall = updateManyCalls[0];

    if (!updateManyCall) {
      throw new Error('updateMany não foi chamado.');
    }

    const updateManyArgs = updateManyCall[0];

    expect(updateManyArgs).toMatchObject({
      where: {
        id: 1,
        status: StatusPedido.PENDENTE,
      },
      data: {
        status: StatusPedido.CANCELADO,
      },
    });

    expect(updateManyArgs.where.paymentExpiresAt.lte).toBeInstanceOf(Date);

    expect(tx.produto.update).toHaveBeenCalledWith({
      where: {
        id: 10,
      },
      data: {
        stockQuantity: {
          increment: 2,
        },
      },
    });
  });
});
