import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthUser } from '../common/types/auth-user.type';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import { PagamentosService } from './pagamentos.service';

interface MercadoPagoWebhookQuery {
  type?: string;
  'data.id'?: string;
}

@Controller('pagamentos')
export class PagamentosController {
  constructor(
    private readonly pagamentosService: PagamentosService,
    private readonly mercadoPagoWebhookService: MercadoPagoWebhookService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('pedidos/:pedidoId/checkout')
  @HttpCode(HttpStatus.CREATED)
  iniciarPagamento(
    @Param('pedidoId', ParseIntPipe)
    pedidoId: number,

    @CurrentUser()
    user: AuthUser,
  ) {
    return this.pagamentosService.iniciarPagamento(user.sub, pedidoId);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receberWebhook(
    @Headers('x-signature')
    xSignature: string | undefined,

    @Headers('x-request-id')
    xRequestId: string | undefined,

    @Query()
    query: MercadoPagoWebhookQuery,
  ) {
    const dataId = query['data.id'];

    this.mercadoPagoWebhookService.validarAssinatura({
      xSignature,
      xRequestId,
      dataId,
    });

    if (query.type && query.type !== 'payment') {
      return {
        received: true,
      };
    }

    if (!dataId) {
      return {
        received: true,
      };
    }

    return this.pagamentosService.processarPagamentoWebhook(dataId);
  }
}
