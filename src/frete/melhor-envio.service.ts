import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import type { FreteCotacaoInput, FreteOption } from './frete.types';

interface MelhorEnvioCompanyResponse {
  name?: string;
  picture?: string;
}

interface MelhorEnvioOptionResponse {
  id?: number | string;
  name?: string;

  price?: string | number;
  custom_price?: string | number;

  delivery_time?: number | string;
  custom_delivery_time?: number | string;

  company?: MelhorEnvioCompanyResponse;

  error?: string;
}

@Injectable()
export class MelhorEnvioService {
  private readonly logger = new Logger(MelhorEnvioService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async calcularFrete(input: FreteCotacaoInput): Promise<FreteOption[]> {
    const accessToken = this.configService.get<string>(
      'MELHOR_ENVIO_ACCESS_TOKEN',
    );

    if (!accessToken) {
      throw new ServiceUnavailableException(
        'A integração com o Melhor Envio ainda não está configurada.',
      );
    }

    const baseUrl = this.configService.getOrThrow<string>(
      'MELHOR_ENVIO_BASE_URL',
    );

    const userAgent = this.configService.getOrThrow<string>(
      'MELHOR_ENVIO_USER_AGENT',
    );

    const url = `${baseUrl.replace(/\/$/, '')}/api/v2/me/shipment/calculate`;

    const payload = {
      from: {
        postal_code: input.originZipCode,
      },

      to: {
        postal_code: input.destinationZipCode,
      },

      products: input.items.map((item) => ({
        id: String(item.productId),

        width: item.widthCm,

        height: item.heightCm,

        length: item.lengthCm,

        weight: item.weightKg,

        insurance_value: Number(item.unitValue.toFixed(2)),

        quantity: item.quantity,
      })),

      options: {
        receipt: false,
        own_hand: false,
      },
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<MelhorEnvioOptionResponse[]>(url, payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,

            'User-Agent': userAgent,

            Accept: 'application/json',

            'Content-Type': 'application/json',
          },
        }),
      );

      return this.normalizeOptions(response.data);
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        this.logger.error(
          `Falha ao consultar Melhor Envio. Status: ${
            error.response?.status ?? 'desconhecido'
          }`,
        );
      } else {
        this.logger.error('Falha inesperada ao consultar Melhor Envio.');
      }

      throw new ServiceUnavailableException(
        'Não foi possível consultar as opções de frete no momento.',
      );
    }
  }

  private normalizeOptions(
    options: MelhorEnvioOptionResponse[],
  ): FreteOption[] {
    return options.flatMap((option) => {
      if (option.error || option.id === undefined || !option.name) {
        return [];
      }

      const price = Number(option.custom_price ?? option.price);

      const deliveryTime = Number(
        option.custom_delivery_time ?? option.delivery_time,
      );

      if (
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isFinite(deliveryTime) ||
        deliveryTime < 0
      ) {
        return [];
      }

      return [
        {
          serviceId: String(option.id),

          serviceName: option.name,

          companyName: option.company?.name ?? 'Transportadora',

          companyPicture: option.company?.picture,

          price,

          deliveryTime,
        },
      ];
    });
  }
}
