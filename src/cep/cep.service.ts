import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export interface CepAddress {
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class CepService {
  constructor(private readonly httpService: HttpService) {}

  async lookup(value: string): Promise<CepAddress> {
    if (!/^\d{5}-?\d{3}$/.test(value)) {
      throw new BadRequestException('Informe um CEP válido com 8 números.');
    }

    const zipCode = value.replace('-', '');

    let data: unknown;

    try {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(
          `https://viacep.com.br/ws/${zipCode}/json/`,
          {
            timeout: 8000,
            maxRedirects: 0,
            proxy: false,
          },
        ),
      );

      data = response.data;
    } catch {
      throw new ServiceUnavailableException(
        'Não foi possível consultar o CEP agora. Tente novamente.',
      );
    }

    if (!isRecord(data)) {
      throw new ServiceUnavailableException(
        'O serviço de CEP retornou uma resposta inválida. Tente novamente.',
      );
    }

    if (data.erro === true || data.erro === 'true') {
      throw new NotFoundException(
        'CEP não encontrado. Confira os números informados.',
      );
    }

    if (
      typeof data.cep !== 'string' ||
      data.cep.replace(/\D/g, '') !== zipCode ||
      typeof data.localidade !== 'string' ||
      !data.localidade.trim() ||
      typeof data.uf !== 'string' ||
      !/^[A-Z]{2}$/.test(data.uf)
    ) {
      throw new ServiceUnavailableException(
        'O serviço de CEP retornou dados incompletos. Tente novamente.',
      );
    }

    return {
      zipCode,
      street: typeof data.logradouro === 'string' ? data.logradouro.trim() : '',
      neighborhood: typeof data.bairro === 'string' ? data.bairro.trim() : '',
      city: data.localidade.trim(),
      state: data.uf,
    };
  }
}
