import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StatusPedido } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { PedidoShippingService } from './pedido-shipping.service';
import { PedidoCreationService } from './services/pedido-creation.service';

describe('PedidoCreationService - idempotência', () => {
  let service: PedidoCreationService;

  const pedidoShippingService = {
    prepararFrete: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  const prisma = {
    pedido: {
      findUnique: jest.fn(),
    },

    cliente: {
      findUnique: jest.fn(),
    },

    produto: {
      findMany: jest.fn(),
    },

    $transaction: jest.fn(),
  };

  const dto: CreatePedidoDto = {
    items: [
      {
        produtoId: 5,
        quantity: 2,
      },
    ],
    shippingServiceId: '1',
    quotedShippingPrice: 12.5,
    quotedZipCode: '60421410',
  };

  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

  const criarPedidoPersistido = (id: number, quantity: number) => ({
    id,
    clienteId: 10,
    idempotencyKey,
    status: StatusPedido.PENDENTE,

    totalPrice: new Prisma.Decimal(
      new Prisma.Decimal('25.00')
        .mul(quantity)
        .add(new Prisma.Decimal('12.50')),
    ),

    shippingPrice: new Prisma.Decimal('12.50'),
    paymentExpiresAt: new Date('2026-09-17T18:00:00.000Z'),

    shippingServiceId: '1',
    shippingServiceName: 'PAC',
    shippingCompanyName: 'Correios',
    shippingDeliveryTime: 5,
    shippingZipCode: '60421410',
    shippingStreet: 'Rua Teste',
    shippingAddressNumber: '100',
    shippingComplement: null,
    shippingNeighborhood: 'Centro',
    shippingCity: 'Fortaleza',
    shippingState: 'CE',

    cliente: {
      id: 10,
      name: 'Cliente Teste',
      email: 'cliente@teste.com',
    },

    items: [
      {
        id: 100 + id,
        produtoId: 5,
        quantity,
        unitPrice: new Prisma.Decimal('25.00'),
        subtotal: new Prisma.Decimal('25.00').mul(quantity),

        produto: {
          id: 5,
          name: 'Mel Silvestre',
          imageUrl: 'https://exemplo.com/mel.jpg',
        },
      },
    ],

    createdAt: new Date('2026-09-17T17:00:00.000Z'),
    updatedAt: new Date('2026-09-17T17:00:00.000Z'),
  });

  beforeEach(() => {
    jest.clearAllMocks();

    service = new PedidoCreationService(
      prisma as unknown as PrismaService,
      pedidoShippingService as unknown as PedidoShippingService,
      configService as unknown as ConfigService,
    );
  });

  it('deve reutilizar pedido existente com a mesma chave sem reservar estoque novamente', async () => {
    const pedidoExistente = criarPedidoPersistido(77, 2);

    prisma.pedido.findUnique.mockResolvedValue(pedidoExistente);

    const result = await service.create(10, dto, idempotencyKey);

    expect(prisma.pedido.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clienteId_idempotencyKey: {
            clienteId: 10,
            idempotencyKey,
          },
        },
      }),
    );

    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
    expect(prisma.produto.findMany).not.toHaveBeenCalled();
    expect(pedidoShippingService.prepararFrete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      id: 77,
      status: StatusPedido.PENDENTE,
      clienteId: 10,
      clienteName: 'Cliente Teste',
      clienteEmail: 'cliente@teste.com',
      totalPrice: 62.5,
      shippingPrice: 12.5,
      shipping: {
        serviceId: '1',
        serviceName: 'PAC',
        companyName: 'Correios',
        deliveryTime: 5,
      },
      items: [
        expect.objectContaining({
          produtoId: 5,
          produtoName: 'Mel Silvestre',
          quantity: 2,
          unitPrice: 25,
          subtotal: 50,
        }),
      ],
    });

    expect(result.shipping.address).toMatchObject({
      zipCode: '60421410',
      city: 'Fortaleza',
      state: 'CE',
    });
  });

  it('deve rejeitar reutilização da mesma chave com dados diferentes', async () => {
    const pedidoExistente = criarPedidoPersistido(77, 1);

    prisma.pedido.findUnique.mockResolvedValue(pedidoExistente);

    await expect(service.create(10, dto, idempotencyKey)).rejects.toThrow(
      new ConflictException(
        'Esta chave de idempotência já foi usada com dados diferentes.',
      ),
    );

    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
    expect(prisma.produto.findMany).not.toHaveBeenCalled();
    expect(pedidoShippingService.prepararFrete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deve reutilizar o pedido vencedor quando duas requisições com a mesma chave concorrerem', async () => {
    const pedidoVencedor = criarPedidoPersistido(88, 2);

    prisma.pedido.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pedidoVencedor);

    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      zipCode: '60421410',
      street: 'Rua Teste',
      addressNumber: '100',
      complement: null,
      neighborhood: 'Centro',
      city: 'Fortaleza',
      state: 'CE',
    });

    prisma.produto.findMany.mockResolvedValue([
      {
        id: 5,
        name: 'Mel Silvestre',
        active: true,
        stockQuantity: 10,
        price: new Prisma.Decimal('25.00'),
      },
    ]);

    pedidoShippingService.prepararFrete.mockResolvedValue({
      shippingPrice: 12.5,
      shippingServiceId: '1',
      shippingServiceName: 'PAC',
      shippingCompanyName: 'Correios',
      shippingDeliveryTime: 5,
      shippingZipCode: '60421410',
      shippingStreet: 'Rua Teste',
      shippingAddressNumber: '100',
      shippingComplement: null,
      shippingNeighborhood: 'Centro',
      shippingCity: 'Fortaleza',
      shippingState: 'CE',
    });

    configService.get.mockReturnValue(30);

    prisma.$transaction.mockRejectedValue({
      code: 'P2002',
    });

    const result = await service.create(10, dto, idempotencyKey);

    expect(prisma.pedido.findUnique).toHaveBeenCalledTimes(2);

    expect(prisma.pedido.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          clienteId_idempotencyKey: {
            clienteId: 10,
            idempotencyKey,
          },
        },
      }),
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      id: 88,
      status: StatusPedido.PENDENTE,
      clienteId: 10,
      totalPrice: 62.5,
      shippingPrice: 12.5,
      items: [
        expect.objectContaining({
          produtoId: 5,
          quantity: 2,
          subtotal: 50,
        }),
      ],
    });
  });
});
