import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreatePedidoDto } from './create-pedido.dto';

describe('CreatePedidoDto', () => {
  async function validateDto(payload: unknown) {
    const dto = plainToInstance(CreatePedidoDto, payload);

    return validate(dto);
  }

  it('deve aceitar um pedido válido', async () => {
    const errors = await validateDto({
      items: [
        {
          produtoId: 1,
          quantity: 2,
        },
      ],
      shippingServiceId: '1',
    });

    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar pedido sem itens', async () => {
    const errors = await validateDto({
      items: [],
      shippingServiceId: '1',
    });

    expect(errors).not.toHaveLength(0);

    const itemsError = errors.find((error) => error.property === 'items');

    expect(itemsError?.constraints).toHaveProperty('arrayMinSize');
  });

  it('deve rejeitar pedido com mais de 50 itens', async () => {
    const items = Array.from(
      {
        length: 51,
      },
      (_, index) => ({
        produtoId: index + 1,
        quantity: 1,
      }),
    );

    const errors = await validateDto({
      items,
      shippingServiceId: '1',
    });

    const itemsError = errors.find((error) => error.property === 'items');

    expect(itemsError?.constraints).toHaveProperty('arrayMaxSize');
  });

  it('deve rejeitar produtoId menor que 1', async () => {
    const errors = await validateDto({
      items: [
        {
          produtoId: 0,
          quantity: 1,
        },
      ],
      shippingServiceId: '1',
    });

    const itemsError = errors.find((error) => error.property === 'items');

    expect(
      itemsError?.children?.[0]?.children?.[0]?.constraints,
    ).toHaveProperty('min');
  });

  it('deve rejeitar quantidade igual a zero', async () => {
    const errors = await validateDto({
      items: [
        {
          produtoId: 1,
          quantity: 0,
        },
      ],
      shippingServiceId: '1',
    });

    const itemsError = errors.find((error) => error.property === 'items');

    expect(
      itemsError?.children?.[0]?.children?.[0]?.constraints,
    ).toHaveProperty('min');
  });

  it('deve rejeitar quantidade maior que 100', async () => {
    const errors = await validateDto({
      items: [
        {
          produtoId: 1,
          quantity: 101,
        },
      ],
      shippingServiceId: '1',
    });

    const itemsError = errors.find((error) => error.property === 'items');

    expect(
      itemsError?.children?.[0]?.children?.[0]?.constraints,
    ).toHaveProperty('max');
  });

  it('deve rejeitar pedido sem opção de frete', async () => {
    const errors = await validateDto({
      items: [
        {
          produtoId: 1,
          quantity: 1,
        },
      ],
      shippingServiceId: '',
    });

    const shippingError = errors.find(
      (error) => error.property === 'shippingServiceId',
    );

    expect(shippingError?.constraints).toHaveProperty('isNotEmpty');
  });
});
