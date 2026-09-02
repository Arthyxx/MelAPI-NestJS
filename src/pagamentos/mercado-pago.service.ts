import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

interface MercadoPagoPreferenceItem {
  id: string;
  title: string;
  quantity: number;
  currency_id: 'BRL';
  unit_price: number;
}

export interface MercadoPagoPreferenceInput {
  pedidoId: number;
  clienteId: number;
  clienteEmail: string;
  items: MercadoPagoPreferenceItem[];
}

interface MercadoPagoPreferenceRequest {
  items: MercadoPagoPreferenceItem[];

  payer: {
    email: string;
  };

  external_reference: string;

  metadata: {
    pedido_id: number;
    cliente_id: number;
  };

  back_urls?: {
    success: string;
    pending: string;
    failure: string;
  };

  auto_return?: 'approved';
}

interface MercadoPagoPreferenceResponse {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

export interface MercadoPagoPreferenceResult {
  preferenceId: string;
  checkoutUrl: string;
}

interface MercadoPagoPaymentResponse {
  id?: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  date_approved?: string | null;

  metadata?: {
    pedido_id?: number | string;
    cliente_id?: number | string;
  };
}

export interface MercadoPagoPaymentResult {
  paymentId: string;
  status: string;
  statusDetail: string | null;
  externalReference: string | null;
  transactionAmount: number;
  approvedAt: Date | null;
  pedidoId: number | null;
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async criarPreferencia(
    input: MercadoPagoPreferenceInput,
  ): Promise<MercadoPagoPreferenceResult> {
    const accessToken = this.getAccessToken();

    const baseUrl = this.configService.getOrThrow<string>(
      'MERCADO_PAGO_BASE_URL',
    );

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    const body: MercadoPagoPreferenceRequest = {
      items: input.items,

      payer: {
        email: input.clienteEmail,
      },

      external_reference: String(input.pedidoId),

      metadata: {
        pedido_id: input.pedidoId,
        cliente_id: input.clienteId,
      },
    };

    if (frontendUrl && this.canUseBackUrls(frontendUrl)) {
      const normalizedFrontendUrl = frontendUrl.replace(/\/+$/, '');

      body.back_urls = {
        success:
          `${normalizedFrontendUrl}/pagamento/sucesso` +
          `?pedidoId=${input.pedidoId}`,

        pending:
          `${normalizedFrontendUrl}/pagamento/pendente` +
          `?pedidoId=${input.pedidoId}`,

        failure:
          `${normalizedFrontendUrl}/pagamento/falhou` +
          `?pedidoId=${input.pedidoId}`,
      };

      body.auto_return = 'approved';
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<MercadoPagoPreferenceResponse>(
          `${baseUrl}/checkout/preferences`,
          body,
          {
            headers: this.buildHeaders(accessToken),
          },
        ),
      );

      const preferenceId = response.data.id;

      const checkoutUrl =
        response.data.init_point ?? response.data.sandbox_init_point;

      if (!preferenceId || !checkoutUrl) {
        this.logger.error(
          'O Mercado Pago retornou uma preferência sem ID ou URL de checkout.',
        );

        throw new ServiceUnavailableException(
          'Não foi possível iniciar o pagamento.',
        );
      }

      return {
        preferenceId,
        checkoutUrl,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (isAxiosError(error)) {
        this.logger.error(
          `Erro ao criar preferência no Mercado Pago. Status: ${
            error.response?.status ?? 'desconhecido'
          }. Resposta: ${JSON.stringify(error.response?.data ?? null)}`,
        );
      } else {
        this.logger.error(
          'Erro ao criar preferência no Mercado Pago.',
          error instanceof Error ? error.stack : undefined,
        );
      }

      throw new ServiceUnavailableException(
        'Não foi possível iniciar o pagamento no Mercado Pago.',
      );
    }
  }

  async buscarPagamento(paymentId: string): Promise<MercadoPagoPaymentResult> {
    const accessToken = this.getAccessToken();

    const baseUrl = this.configService.getOrThrow<string>(
      'MERCADO_PAGO_BASE_URL',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.get<MercadoPagoPaymentResponse>(
          `${baseUrl}/v1/payments/${encodeURIComponent(paymentId)}`,
          {
            headers: this.buildHeaders(accessToken),
          },
        ),
      );

      const payment = response.data;

      if (
        payment.id === undefined ||
        !payment.status ||
        typeof payment.transaction_amount !== 'number'
      ) {
        this.logger.error(
          `Resposta inválida ao consultar pagamento ${paymentId} no Mercado Pago.`,
        );

        throw new ServiceUnavailableException(
          'Não foi possível validar o pagamento.',
        );
      }

      const metadataPedidoId = payment.metadata?.pedido_id;

      const parsedPedidoId =
        metadataPedidoId !== undefined ? Number(metadataPedidoId) : null;

      const approvedAt = payment.date_approved
        ? new Date(payment.date_approved)
        : null;

      return {
        paymentId: String(payment.id),

        status: payment.status,

        statusDetail: payment.status_detail ?? null,

        externalReference: payment.external_reference ?? null,

        transactionAmount: payment.transaction_amount,

        approvedAt:
          approvedAt && !Number.isNaN(approvedAt.getTime()) ? approvedAt : null,

        pedidoId:
          parsedPedidoId !== null &&
          Number.isInteger(parsedPedidoId) &&
          parsedPedidoId > 0
            ? parsedPedidoId
            : null,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (isAxiosError(error)) {
        this.logger.error(
          `Erro ao consultar pagamento ${paymentId} no Mercado Pago. Status: ${
            error.response?.status ?? 'desconhecido'
          }. Resposta: ${JSON.stringify(error.response?.data ?? null)}`,
        );
      } else {
        this.logger.error(
          `Erro ao consultar pagamento ${paymentId} no Mercado Pago.`,
          error instanceof Error ? error.stack : undefined,
        );
      }

      throw new ServiceUnavailableException(
        'Não foi possível validar o pagamento no Mercado Pago.',
      );
    }
  }

  private getAccessToken() {
    const accessToken = this.configService.get<string>(
      'MERCADO_PAGO_ACCESS_TOKEN',
    );

    if (!accessToken) {
      throw new ServiceUnavailableException(
        'A integração com o Mercado Pago ainda não está configurada.',
      );
    }

    return accessToken;
  }

  private buildHeaders(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private canUseBackUrls(frontendUrl: string) {
    try {
      const url = new URL(frontendUrl);

      if (url.protocol !== 'https:') {
        return false;
      }

      const hostname = url.hostname.toLowerCase();

      return (
        hostname !== 'localhost' &&
        hostname !== '127.0.0.1' &&
        hostname !== '::1'
      );
    } catch {
      return false;
    }
  }
}
