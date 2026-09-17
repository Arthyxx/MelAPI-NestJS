import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { PedidosModule } from '../pedidos/pedidos.module';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import { MercadoPagoService } from './mercado-pago.service';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';
import { CheckoutService } from './services/checkout.service';
import { PagamentoWebhookService } from './services/pagamento-webhook.service';
import { ReembolsoService } from './services/reembolso.service';
import { ReembolsoWebhookService } from './services/reembolso-webhook.service';

@Module({
  imports: [HttpModule, PedidosModule],

  controllers: [PagamentosController],

  providers: [
    PagamentosService,
    CheckoutService,
    PagamentoWebhookService,
    ReembolsoService,
    ReembolsoWebhookService,
    MercadoPagoService,
    MercadoPagoWebhookService,
  ],
})
export class PagamentosModule {}
