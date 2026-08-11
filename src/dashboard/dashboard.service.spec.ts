import {
  Test,
  TestingModule,
} from '@nestjs/testing';

import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const prismaMock = {
    cliente: {
      count: jest.fn(),
    },
    categoria: {
      count: jest.fn(),
    },
    produto: {
      count: jest.fn(),
    },
    pedido: {
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation(
      async (
        operations: Promise<unknown>[],
      ) => Promise.all(operations),
    );

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          DashboardService,
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service =
      module.get<DashboardService>(
        DashboardService,
      );
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('deve retornar o resumo administrativo', async () => {
    prismaMock.cliente.count.mockResolvedValue(
      3,
    );

    prismaMock.categoria.count.mockResolvedValue(
      2,
    );

    prismaMock.produto.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);

    prismaMock.pedido.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1);

    prismaMock.pedido.aggregate.mockResolvedValue(
      {
        _sum: {
          total: 325.9,
          totalPrice: 325.9,
          valorTotal: 325.9,
        },
      },
    );

    const result =
      await service.getSummary();

    expect(result).toEqual({
      clientes: {
        ativos: 3,
      },
      categorias: {
        ativas: 2,
      },
      produtos: {
        ativos: 4,
        semEstoque: 1,
      },
      pedidos: {
        total: 10,
        pendentes: 2,
        entregues: 5,
        cancelados: 1,
      },
      faturamento: {
        total: 325.9,
      },
    });

    expect(
      prismaMock.$transaction,
    ).toHaveBeenCalledTimes(1);
  });

  it('deve retornar faturamento zero quando não houver vendas', async () => {
    prismaMock.cliente.count.mockResolvedValue(
      0,
    );

    prismaMock.categoria.count.mockResolvedValue(
      0,
    );

    prismaMock.produto.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    prismaMock.pedido.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    prismaMock.pedido.aggregate.mockResolvedValue(
      {
        _sum: {
          total: null,
          totalPrice: null,
          valorTotal: null,
        },
      },
    );

    const result =
      await service.getSummary();

    expect(
      result.faturamento.total,
    ).toBe(0);
  });
});