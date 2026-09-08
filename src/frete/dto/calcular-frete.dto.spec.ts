import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CalcularFreteDto } from './calcular-frete.dto';

describe('CalcularFreteDto', () => {
  async function validateDto(payload: unknown) {
    const dto = plainToInstance(CalcularFreteDto, payload);

    return validate(dto);
  }

  it('deve aceitar uma solicitação de frete válida', async () => {
    const errors = await validateDto({
      destinationZipCode: '60000-000',
      items: [
        {
          productId: 1,
          quantity: 2,
        },
      ],
    });

    expect(errors).toHaveLength(0);
  });

  it('deve aceitar CEP sem hífen', async () => {
    const errors = await validateDto({
      destinationZipCode: '60000000',
      items: [
        {
          productId: 1,
          quantity: 1,
        },
      ],
    });

    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar CEP inválido', async () => {
    const errors = await validateDto({
      destinationZipCode: '6000',
      items: [
        {
          productId: 1,
          quantity: 1,
        },
      ],
    });

    const zipCodeError = errors.find(
      (error) => error.property === 'destinationZipCode',
    );

    expect(zipCodeError?.constraints).toHaveProperty('matches');
  });

  it('deve rejeitar solicitação sem itens', async () => {
    const errors = await validateDto({
      destinationZipCode: '60000-000',
      items: [],
    });

    const itemsError = errors.find((error) => error.property === 'items');

    expect(itemsError?.constraints).toHaveProperty('arrayMinSize');
  });

  it('deve rejeitar solicitação com mais de 50 itens', async () => {
    const items = Array.from(
      {
        length: 51,
      },
      (_, index) => ({
        productId: index + 1,
        quantity: 1,
      }),
    );

    const errors = await validateDto({
      destinationZipCode: '60000-000',
      items,
    });

    const itemsError = errors.find((error) => error.property === 'items');

    expect(itemsError?.constraints).toHaveProperty('arrayMaxSize');
  });

  it('deve rejeitar productId menor que 1', async () => {
    const errors = await validateDto({
      destinationZipCode: '60000-000',
      items: [
        {
          productId: 0,
          quantity: 1,
        },
      ],
    });

    const itemsError = errors.find((error) => error.property === 'items');

    expect(
      itemsError?.children?.[0]?.children?.[0]?.constraints,
    ).toHaveProperty('min');
  });

  it('deve rejeitar quantidade igual a zero', async () => {
    const errors = await validateDto({
      destinationZipCode: '60000-000',
      items: [
        {
          productId: 1,
          quantity: 0,
        },
      ],
    });

    const itemsError = errors.find((error) => error.property === 'items');

    expect(
      itemsError?.children?.[0]?.children?.[0]?.constraints,
    ).toHaveProperty('min');
  });

  it('deve rejeitar quantidade maior que 100', async () => {
    const errors = await validateDto({
      destinationZipCode: '60000-000',
      items: [
        {
          productId: 1,
          quantity: 101,
        },
      ],
    });

    const itemsError = errors.find((error) => error.property === 'items');

    expect(
      itemsError?.children?.[0]?.children?.[0]?.constraints,
    ).toHaveProperty('max');
  });
});
