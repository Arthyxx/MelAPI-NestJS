import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import { MercadoPagoService } from './mercado-pago.service';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';

@Module({
  imports: [HttpModule],

  controllers: [PagamentosController],

  providers: [PagamentosService, MercadoPagoService, MercadoPagoWebhookService],

  exports: [PagamentosService, MercadoPagoService, MercadoPagoWebhookService],
})
export class PagamentosModule {}
