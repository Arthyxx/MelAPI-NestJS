import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

interface MelhorEnvioProduto {
  productId: number;
  name: string;
  quantity: number;
  unitValue: number;
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

interface MelhorEnvioCotacaoInput {
  originZipCode: string;
  destinationZipCode: string;
  items: MelhorEnvioProduto[];
}

@Injectable()
export class MelhorEnvioService {
  private readonly logger = new Logger(MelhorEnvioService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async calcularFrete(input: MelhorEnvioCotacaoInput): Promise<unknown> {
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
        this.httpService.post<unknown>(url, payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,

            'User-Agent': userAgent,

            Accept: 'application/json',

            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data;
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
}
