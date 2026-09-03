import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { PedidosModule } from '../pedidos/pedidos.module';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import { MercadoPagoService } from './mercado-pago.service';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';

@Module({
  imports: [HttpModule, PedidosModule],

  controllers: [PagamentosController],

  providers: [PagamentosService, MercadoPagoService, MercadoPagoWebhookService],
})
export class PagamentosModule {}
