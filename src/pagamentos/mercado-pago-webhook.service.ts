import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface ValidateWebhookSignatureInput {
  xSignature?: string;
  xRequestId?: string;
  dataId?: string;
}

@Injectable()
export class MercadoPagoWebhookService {
  constructor(private readonly configService: ConfigService) {}

  validarAssinatura({
    xSignature,
    xRequestId,
    dataId,
  }: ValidateWebhookSignatureInput) {
    const secret = this.configService.get<string>(
      'MERCADO_PAGO_WEBHOOK_SECRET',
    );

    if (!secret) {
      throw new ServiceUnavailableException(
        'A validação dos Webhooks do Mercado Pago ainda não está configurada.',
      );
    }

    if (!xSignature || !xRequestId || !dataId) {
      throw new UnauthorizedException('Webhook do Mercado Pago inválido.');
    }

    const signatureParts = xSignature.split(',');

    let timestamp: string | null = null;

    let receivedHash: string | null = null;

    for (const part of signatureParts) {
      const [key, value] = part.split('=', 2).map((item) => item.trim());

      if (key === 'ts' && value) {
        timestamp = value;
      }

      if (key === 'v1' && value) {
        receivedHash = value;
      }
    }

    if (!timestamp || !receivedHash) {
      throw new UnauthorizedException(
        'Assinatura do Webhook do Mercado Pago inválida.',
      );
    }

    const normalizedDataId = dataId.toLowerCase();

    const manifest =
      `id:${normalizedDataId};` +
      `request-id:${xRequestId};` +
      `ts:${timestamp};`;

    const expectedHash = createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    const receivedBuffer = Buffer.from(receivedHash, 'hex');

    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    const validLength = receivedBuffer.length === expectedBuffer.length;

    const validSignature =
      validLength && timingSafeEqual(receivedBuffer, expectedBuffer);

    if (!validSignature) {
      throw new UnauthorizedException(
        'Assinatura do Webhook do Mercado Pago inválida.',
      );
    }
  }
}
