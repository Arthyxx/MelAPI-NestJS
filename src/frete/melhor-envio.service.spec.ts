import { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';

import { MelhorEnvioService } from './melhor-envio.service';

describe('MelhorEnvioService', () => {
  const post = jest.fn();

  const httpService = {
    post,
  };

  const configService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  let service: MelhorEnvioService;

  beforeEach(() => {
    jest.clearAllMocks();

    configService.get.mockReturnValue('sandbox-access-token');

    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'MELHOR_ENVIO_BASE_URL') {
        return 'https://sandbox.melhorenvio.com.br';
      }

      if (key === 'MELHOR_ENVIO_USER_AGENT') {
        return 'Apiario Vitoria Seven (apiariovitoriaseven@gmail.com)';
      }

      throw new Error(`Configuração não encontrada: ${key}`);
    });

    service = new MelhorEnvioService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('deve enviar a cotação e normalizar as opções retornadas', async () => {
    const response = {
      data: [
        {
          id: 1,
          name: 'PAC',
          price: '30.00',
          custom_price: '25.90',
          delivery_time: 8,
          custom_delivery_time: 6,
          company: {
            name: 'Correios',
            picture: 'https://example.com/correios.png',
          },
        },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as AxiosResponse;

    post.mockReturnValue(of(response));

    const result = await service.calcularFrete({
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
        serviceId: '1',
        serviceName: 'PAC',
        companyName: 'Correios',
        companyPicture: 'https://example.com/correios.png',
        price: 25.9,
        deliveryTime: 6,
      },
    ]);

    expect(post).toHaveBeenCalledWith(
      'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate',
      {
        from: {
          postal_code: '62300000',
        },

        to: {
          postal_code: '60000000',
        },

        products: [
          {
            id: '1',
            width: 12,
            height: 15,
            length: 12,
            weight: 0.78,
            insurance_value: 25.9,
            quantity: 2,
          },
        ],

        options: {
          receipt: false,
          own_hand: false,
        },
      },
      {
        headers: {
          Authorization: 'Bearer sandbox-access-token',

          'User-Agent': 'Apiario Vitoria Seven (apiariovitoriaseven@gmail.com)',

          Accept: 'application/json',

          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('deve usar price e delivery_time quando não houver valores customizados', async () => {
    const response = {
      data: [
        {
          id: 2,
          name: 'SEDEX',
          price: '42.50',
          delivery_time: 3,
          company: {
            name: 'Correios',
          },
        },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as AxiosResponse;

    post.mockReturnValue(of(response));

    const result = await service.calcularFrete({
      originZipCode: '62300000',
      destinationZipCode: '60000000',
      items: [],
    });

    expect(result).toEqual([
      {
        serviceId: '2',
        serviceName: 'SEDEX',
        companyName: 'Correios',
        companyPicture: undefined,
        price: 42.5,
        deliveryTime: 3,
      },
    ]);
  });

  it('deve ignorar opções com erro ou dados inválidos', async () => {
    const response = {
      data: [
        {
          id: 1,
          name: 'PAC',
          error: 'Serviço indisponível.',
        },
        {
          id: 2,
          name: 'SEDEX',
          price: 'abc',
          delivery_time: 3,
        },
        {
          id: 3,
          name: 'Transportadora',
          price: '30.00',
          delivery_time: 5,
          company: {
            name: 'Transportadora Teste',
          },
        },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as AxiosResponse;

    post.mockReturnValue(of(response));

    const result = await service.calcularFrete({
      originZipCode: '62300000',
      destinationZipCode: '60000000',
      items: [],
    });

    expect(result).toEqual([
      {
        serviceId: '3',
        serviceName: 'Transportadora',
        companyName: 'Transportadora Teste',
        companyPicture: undefined,
        price: 30,
        deliveryTime: 5,
      },
    ]);
  });

  it('deve rejeitar consulta quando o token não estiver configurado', async () => {
    configService.get.mockReturnValue(undefined);

    await expect(
      service.calcularFrete({
        originZipCode: '62300000',
        destinationZipCode: '60000000',
        items: [],
      }),
    ).rejects.toThrow(
      new ServiceUnavailableException(
        'A integração com o Melhor Envio ainda não está configurada.',
      ),
    );

    expect(post).not.toHaveBeenCalled();
  });

  it('deve transformar erro do Melhor Envio em indisponibilidade do serviço', async () => {
    post.mockReturnValue(
      throwError(() => ({
        isAxiosError: true,
        response: {
          status: 500,
        },
      })),
    );

    await expect(
      service.calcularFrete({
        originZipCode: '62300000',
        destinationZipCode: '60000000',
        items: [
          {
            productId: 1,
            name: 'Mel 500g',
            quantity: 1,
            unitValue: 25.9,
            weightKg: 0.78,
            heightCm: 15,
            widthCm: 12,
            lengthCm: 12,
          },
        ],
      }),
    ).rejects.toThrow(
      'Não foi possível consultar as opções de frete no momento.',
    );
  });
});
