import { BadRequestException } from '@nestjs/common';

import type { AuthUser } from '../common/types/auth-user.type';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

describe('PedidosController - idempotência', () => {
  let controller: PedidosController;

  const pedidosService = {
    create: jest.fn(),
  };

  const user = {
    sub: 10,
  } as AuthUser;

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

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new PedidosController(
      pedidosService as unknown as PedidosService,
    );
  });

  it('deve encaminhar uma chave de idempotência válida ao service', async () => {
    const response = {
      id: 77,
      status: 'PENDENTE',
    };

    pedidosService.create.mockResolvedValue(response);

    const result = await controller.create(
      user,
      dto,
      '550E8400-E29B-41D4-A716-446655440000',
    );

    expect(pedidosService.create).toHaveBeenCalledWith(
      10,
      dto,
      '550e8400-e29b-41d4-a716-446655440000',
    );

    expect(result).toEqual(response);
  });

  it('deve rejeitar criação sem Idempotency-Key', () => {
    expect(() => controller.create(user, dto, undefined)).toThrow(
      new BadRequestException(
        'Informe uma chave de idempotência válida no header Idempotency-Key.',
      ),
    );

    expect(pedidosService.create).not.toHaveBeenCalled();
  });

  it('deve rejeitar Idempotency-Key inválida', () => {
    expect(() => controller.create(user, dto, 'chave-invalida')).toThrow(
      new BadRequestException(
        'Informe uma chave de idempotência válida no header Idempotency-Key.',
      ),
    );

    expect(pedidosService.create).not.toHaveBeenCalled();
  });
});
