import { Injectable } from '@nestjs/common';

import { CheckoutService } from './services/checkout.service';
import { PagamentoWebhookService } from './services/pagamento-webhook.service';
import { ReembolsoService } from './services/reembolso.service';

@Injectable()
export class PagamentosService {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly reembolsoService: ReembolsoService,
    private readonly pagamentoWebhookService: PagamentoWebhookService,
  ) {}

  async iniciarPagamento(clienteId: number, pedidoId: number) {
    return this.checkoutService.iniciarPagamento(clienteId, pedidoId);
  }

  async cancelarPedidoComReembolso(pedidoId: number) {
    return this.reembolsoService.cancelarPedidoComReembolso(pedidoId);
  }

  async processarPagamentoWebhook(paymentId: string) {
    return this.pagamentoWebhookService.processarPagamentoWebhook(paymentId);
  }
}
