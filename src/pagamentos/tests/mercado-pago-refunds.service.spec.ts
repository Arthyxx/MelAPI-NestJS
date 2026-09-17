import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { AxiosResponse } from 'axios';
import { of } from 'rxjs';

import { MercadoPagoService } from '../mercado-pago.service';

interface RefundResult {
  refundId: string;
  paymentId: string;
  amount: number;
  status: string;
  createdAt: Date | null;
}

interface MercadoPagoServiceWithRefunds {
  listarReembolsos(paymentId: string): Promise<RefundResult[]>;
}

describe('MercadoPagoService - consulta de reembolsos', () => {
  const httpService = {
    get: jest.fn(),
    post: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  let service: MercadoPagoService;

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

      return undefined;
    });

    service = new MercadoPagoService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('deve consultar e normalizar os reembolsos de um pagamento', async () => {
    httpService.get.mockReturnValue(
      of({
        data: [
          {
            id: 999,
            payment_id: 123,
            amount: 75,
            status: 'approved',
            date_created: '2026-09-08T12:30:00.000Z',
          },
        ],
      } as AxiosResponse),
    );

    const refundsService = service as unknown as MercadoPagoServiceWithRefunds;

    const result = await refundsService.listarReembolsos('123');

    expect(httpService.get).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments/123/refunds',
      {
        headers: {
          Authorization: 'Bearer TEST-ACCESS-TOKEN',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      },
    );

    expect(result).toEqual([
      {
        refundId: '999',
        paymentId: '123',
        amount: 75,
        status: 'approved',
        createdAt: new Date('2026-09-08T12:30:00.000Z'),
      },
    ]);
  });

  it('deve retornar lista vazia quando o pagamento não possuir reembolsos', async () => {
    httpService.get.mockReturnValue(
      of({
        data: [],
      } as AxiosResponse),
    );

    const refundsService = service as unknown as MercadoPagoServiceWithRefunds;

    const result = await refundsService.listarReembolsos('123');

    expect(result).toEqual([]);
  });
});
