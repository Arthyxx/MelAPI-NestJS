import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { FreteService } from './frete.service';
import { MelhorEnvioService } from './melhor-envio.service';

describe('FreteService', () => {
  const findMany = jest.fn();

  const prisma = {
    produto: {
      findMany,
    },
  };

  const configService = {
    getOrThrow: jest.fn(),
  };

  const melhorEnvioService = {
    calcularFrete: jest.fn(),
  };

  let service: FreteService;

  beforeEach(() => {
    jest.clearAllMocks();

    configService.getOrThrow.mockReturnValue('62300000');

    service = new FreteService(
      prisma as unknown as PrismaService,
      configService as unknown as ConfigService,
      melhorEnvioService as unknown as MelhorEnvioService,
    );
  });

  it('deve preparar os dados da cotação usando informações do banco', async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Mel 500g',
        price: new Prisma.Decimal('25.90'),
        stockQuantity: 10,
        weightKg: new Prisma.Decimal('0.780'),
        heightCm: new Prisma.Decimal('15.00'),
        widthCm: new Prisma.Decimal('12.00'),
        lengthCm: new Prisma.Decimal('12.00'),
      },
    ]);

    const result = await service.prepararCotacao({
      destinationZipCode: '60000-000',
      items: [
        {
          productId: 1,
          quantity: 2,
        },
      ],
    });

    expect(result).toEqual({
      originZipCode: '62300000',
      destinationZipCode: '60000000',
      items: [
        {
          productId: 1,
          name: 'Mel 500g',
          quantity: 2,
          unitValue: 25.9,
          weightKg: 0.78,
          heightCm: 15,
          widthCm: 12,
          lengthCm: 12,
        },
      ],
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: [1],
        },
        active: true,
      },
      select: {
        id: true,
        name: true,
        price: true,
        stockQuantity: true,
        weightKg: true,
        heightCm: true,
        widthCm: true,
        lengthCm: true,
      },
    });
  });

  it('deve consultar o Melhor Envio com os dados preparados', async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Mel 500g',
        price: new Prisma.Decimal('25.90'),
        stockQuantity: 10,
        weightKg: new Prisma.Decimal('0.780'),
        heightCm: new Prisma.Decimal('15'),
        widthCm: new Prisma.Decimal('12'),
        lengthCm: new Prisma.Decimal('12'),
      },
    ]);

    melhorEnvioService.calcularFrete.mockResolvedValue([
      {
        id: 1,
        name: 'PAC',
        price: '25.90',
      },
    ]);

    const result = await service.calcularFrete({
      destinationZipCode: '60000-000',
      items: [
        {
          productId: 1,
          quantity: 2,
        },
      ],
    });

    expect(melhorEnvioService.calcularFrete).toHaveBeenCalledWith({
      originZipCode: '62300000',
      destinationZipCode: '60000000',
      items: [
        {
          productId: 1,
          name: 'Mel 500g',
          quantity: 2,
          unitValue: 25.9,
          weightKg: 0.78,
          heightCm: 15,
          widthCm: 12,
          lengthCm: 12,
        },
      ],
    });

    expect(result).toEqual([
      {
        id: 1,
        name: 'PAC',
        price: '25.90',
      },
    ]);
  });

  it('deve somar quantidades repetidas do mesmo produto', async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Mel 500g',
        price: new Prisma.Decimal('25.90'),
        stockQuantity: 10,
        weightKg: new Prisma.Decimal('0.780'),
        heightCm: new Prisma.Decimal('15'),
        widthCm: new Prisma.Decimal('12'),
        lengthCm: new Prisma.Decimal('12'),
      },
    ]);

    const result = await service.prepararCotacao({
      destinationZipCode: '60000000',
      items: [
        {
          productId: 1,
          quantity: 2,
        },
        {
          productId: 1,
          quantity: 3,
        },
      ],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(5);
  });

  it('deve rejeitar produto inexistente ou inativo', async () => {
    findMany.mockResolvedValue([]);

    await expect(
      service.prepararCotacao({
        destinationZipCode: '60000000',
        items: [
          {
            productId: 999,
            quantity: 1,
          },
        ],
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Um ou mais produtos estão indisponíveis para cálculo de frete.',
      ),
    );
  });

  it('deve rejeitar quantidade maior que o estoque', async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Mel 500g',
        price: new Prisma.Decimal('25.90'),
        stockQuantity: 1,
        weightKg: new Prisma.Decimal('0.780'),
        heightCm: new Prisma.Decimal('15'),
        widthCm: new Prisma.Decimal('12'),
        lengthCm: new Prisma.Decimal('12'),
      },
    ]);

    await expect(
      service.prepararCotacao({
        destinationZipCode: '60000000',
        items: [
          {
            productId: 1,
            quantity: 2,
          },
        ],
      }),
    ).rejects.toThrow('Estoque insuficiente para o produto "Mel 500g".');
  });

  it('deve rejeitar produto sem peso ou dimensões completas', async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Mel 500g',
        price: new Prisma.Decimal('25.90'),
        stockQuantity: 10,
        weightKg: null,
        heightCm: new Prisma.Decimal('15'),
        widthCm: new Prisma.Decimal('12'),
        lengthCm: new Prisma.Decimal('12'),
      },
    ]);

    await expect(
      service.prepararCotacao({
        destinationZipCode: '60000000',
        items: [
          {
            productId: 1,
            quantity: 1,
          },
        ],
      }),
    ).rejects.toThrow(
      'O produto "Mel 500g" não possui peso e dimensões completos para cálculo de frete.',
    );
  });
});
