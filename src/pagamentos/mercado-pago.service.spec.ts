import { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';

import { MercadoPagoService } from './mercado-pago.service';

interface HttpRequestOptions {
  headers: Record<string, string>;
  timeout: number;
}

type PostCall = [string, unknown, HttpRequestOptions];

type GetCall = [string, HttpRequestOptions];

interface PreferenceBody {
  external_reference?: string;

  metadata?: {
    pedido_id: number;
    cliente_id: number;
  };

  expires?: boolean;

  expiration_date_from?: string;

  expiration_date_to?: string;

  back_urls?: {
    success: string;
    pending: string;
    failure: string;
  };

  auto_return?: string;
}

describe('MercadoPagoService', () => {
  let service: MercadoPagoService;

  const httpService = {
    get: jest.fn(),
    post: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  const getPostCall = (index = 0): PostCall => {
    const calls = httpService.post.mock.calls as unknown as PostCall[];

    const call = calls[index];

    if (!call) {
      throw new Error(`POST não foi chamado na posição ${index}.`);
    }

    return call;
  };

  const getGetCall = (index = 0): GetCall => {
    const calls = httpService.get.mock.calls as unknown as GetCall[];

    const call = calls[index];

    if (!call) {
      throw new Error(`GET não foi chamado na posição ${index}.`);
    }

    return call;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'MERCADO_PAGO_BASE_URL') {
        return 'https://api.mercadopago.com';
      }

      throw new Error(`Configuração ${key} não encontrada.`);
    });

    configService.get.mockImplementation((key: string) => {
      if (key === 'MERCADO_PAGO_ACCESS_TOKEN') {
        return 'TEST-ACCESS-TOKEN';
      }

      if (key === 'FRONTEND_URL') {
        return 'https://loja.teste.com.br';
      }

      return undefined;
    });

    service = new MercadoPagoService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve criar preferência com prazo de expiração do pedido', async () => {
    const paymentExpiresAt = new Date('2026-09-08T18:00:00.000Z');

    const response = {
      data: {
        id: 'pref-123',

        init_point: 'https://checkout.mercadopago.com/pref-123',
      },
    } as AxiosResponse;

    httpService.post.mockReturnValue(of(response));

    const result = await service.criarPreferencia({
      pedidoId: 10,

      clienteId: 5,

      clienteEmail: 'cliente@teste.com',

      paymentExpiresAt,

      items: [
        {
          id: '1',

          title: 'Mel Silvestre',

          quantity: 2,

          currency_id: 'BRL',

          unit_price: 25,
        },
      ],
    });

    expect(httpService.post).toHaveBeenCalledTimes(1);

    const [url, bodyValue, options] = getPostCall();

    const body = bodyValue as PreferenceBody;

    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');

    expect(body).toEqual(
      expect.objectContaining({
        external_reference: '10',

        metadata: {
          pedido_id: 10,
          cliente_id: 5,
        },

        expires: true,

        expiration_date_to: paymentExpiresAt.toISOString(),

        back_urls: {
          success: 'https://loja.teste.com.br/pagamento/sucesso?pedidoId=10',

          pending: 'https://loja.teste.com.br/pagamento/pendente?pedidoId=10',

          failure: 'https://loja.teste.com.br/pagamento/falhou?pedidoId=10',
        },

        auto_return: 'approved',
      }),
    );

    expect(typeof body.expiration_date_from).toBe('string');

    expect(options.timeout).toBe(15_000);

    expect(options.headers).toEqual({
      Authorization: 'Bearer TEST-ACCESS-TOKEN',

      Accept: 'application/json',

      'Content-Type': 'application/json',
    });

    expect(result).toEqual({
      preferenceId: 'pref-123',

      checkoutUrl: 'https://checkout.mercadopago.com/pref-123',
    });
  });

  it('não deve enviar back_urls quando FRONTEND_URL não for HTTPS pública', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'MERCADO_PAGO_ACCESS_TOKEN') {
        return 'TEST-ACCESS-TOKEN';
      }

      if (key === 'FRONTEND_URL') {
        return 'http://localhost:5173';
      }

      return undefined;
    });

    httpService.post.mockReturnValue(
      of({
        data: {
          id: 'pref-123',

          sandbox_init_point: 'https://sandbox.mercadopago.com/pref-123',
        },
      } as AxiosResponse),
    );

    await service.criarPreferencia({
      pedidoId: 10,

      clienteId: 5,

      clienteEmail: 'cliente@teste.com',

      paymentExpiresAt: new Date(Date.now() + 30 * 60_000),

      items: [
        {
          id: '1',

          title: 'Mel Silvestre',

          quantity: 1,

          currency_id: 'BRL',

          unit_price: 25,
        },
      ],
    });

    const [, bodyValue] = getPostCall();

    const body = bodyValue as PreferenceBody;

    expect(body.back_urls).toBeUndefined();

    expect(body.auto_return).toBeUndefined();
  });

  it('deve consultar pagamento com timeout configurado', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          id: 123,

          status: 'approved',

          status_detail: 'accredited',

          external_reference: '10',

          transaction_amount: 75,

          date_approved: '2026-09-08T12:00:00.000Z',

          metadata: {
            pedido_id: 10,
            cliente_id: 5,
          },
        },
      } as AxiosResponse),
    );

    const result = await service.buscarPagamento('123');

    const [url, options] = getGetCall();

    expect(url).toBe('https://api.mercadopago.com/v1/payments/123');

    expect(options).toEqual({
      headers: {
        Authorization: 'Bearer TEST-ACCESS-TOKEN',

        Accept: 'application/json',

        'Content-Type': 'application/json',
      },

      timeout: 15_000,
    });

    expect(result).toEqual({
      paymentId: '123',

      status: 'approved',

      statusDetail: 'accredited',

      externalReference: '10',

      transactionAmount: 75,

      approvedAt: new Date('2026-09-08T12:00:00.000Z'),

      pedidoId: 10,
    });
  });

  it('deve realizar reembolso total com chave de idempotência', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          id: 999,

          payment_id: 123,

          amount: 75,

          status: 'approved',

          date_created: '2026-09-08T12:30:00.000Z',
        },
      } as AxiosResponse),
    );

    const result = await service.reembolsarPagamento('123');

    expect(httpService.post).toHaveBeenCalledTimes(1);

    const [url, body, options] = getPostCall();

    expect(url).toBe('https://api.mercadopago.com/v1/payments/123/refunds');

    expect(body).toEqual({});

    const idempotencyKey = options.headers['X-Idempotency-Key'];

    expect(idempotencyKey).toEqual(expect.any(String));

    expect(idempotencyKey).toHaveLength(64);

    expect(options.timeout).toBe(15_000);

    expect(result).toEqual({
      refundId: '999',

      paymentId: '123',

      amount: 75,

      status: 'approved',

      createdAt: new Date('2026-09-08T12:30:00.000Z'),
    });
  });

  it('deve gerar a mesma chave de idempotência para o mesmo pagamento', async () => {
    const refundResponse = {
      data: {
        id: 999,

        payment_id: 123,

        amount: 75,

        status: 'approved',

        date_created: '2026-09-08T12:30:00.000Z',
      },
    } as AxiosResponse;

    httpService.post.mockReturnValue(of(refundResponse));

    await service.reembolsarPagamento('123');

    const [, , firstOptions] = getPostCall();

    const firstKey = firstOptions.headers['X-Idempotency-Key'];

    jest.clearAllMocks();

    httpService.post.mockReturnValue(of(refundResponse));

    await service.reembolsarPagamento('123');

    const [, , secondOptions] = getPostCall();

    const secondKey = secondOptions.headers['X-Idempotency-Key'];

    expect(secondKey).toBe(firstKey);
  });

  it('deve falhar quando Mercado Pago retornar preferência sem ID', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          init_point: 'https://checkout.mercadopago.com',
        },
      } as AxiosResponse),
    );

    await expect(
      service.criarPreferencia({
        pedidoId: 10,

        clienteId: 5,

        clienteEmail: 'cliente@teste.com',

        paymentExpiresAt: new Date(Date.now() + 30 * 60_000),

        items: [
          {
            id: '1',

            title: 'Mel',

            quantity: 1,

            currency_id: 'BRL',

            unit_price: 25,
          },
        ],
      }),
    ).rejects.toThrow(
      new ServiceUnavailableException('Não foi possível iniciar o pagamento.'),
    );
  });

  it('deve transformar falha HTTP em ServiceUnavailableException', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('Falha simulada')),
    );

    await expect(service.buscarPagamento('123')).rejects.toThrow(
      new ServiceUnavailableException(
        'Não foi possível validar o pagamento no Mercado Pago.',
      ),
    );
  });
});
