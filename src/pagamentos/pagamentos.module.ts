import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { PedidosModule } from '../pedidos/pedidos.module';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import { MercadoPagoService } from './mercado-pago.service';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';
import { CheckoutService } from './services/checkout.service';

@Module({
  imports: [HttpModule, PedidosModule],

  controllers: [PagamentosController],

  providers: [
    PagamentosService,
    CheckoutService,
    MercadoPagoService,
    MercadoPagoWebhookService,
  ],
})
export class PagamentosModule {}
