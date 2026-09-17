import { CheckoutService } from '../services/checkout.service';
import { PagamentoWebhookService } from '../services/pagamento-webhook.service';
import { ReembolsoService } from '../services/reembolso.service';
import { PagamentosService } from '../pagamentos.service';

describe('PagamentosService', () => {
  const checkoutService = {
    iniciarPagamento: jest.fn(),
  };

  const reembolsoService = {
    cancelarPedidoComReembolso: jest.fn(),
  };

  const pagamentoWebhookService = {
    processarPagamentoWebhook: jest.fn(),
  };

  let service: PagamentosService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new PagamentosService(
      checkoutService as unknown as CheckoutService,
      reembolsoService as unknown as ReembolsoService,
      pagamentoWebhookService as unknown as PagamentoWebhookService,
    );
  });

  it('deve delegar início de pagamento para CheckoutService', async () => {
    checkoutService.iniciarPagamento.mockResolvedValue({
      pedidoId: 25,
      preferenceId: 'pref-123',
      checkoutUrl: 'https://checkout.test/pref-123',
    });

    await expect(service.iniciarPagamento(10, 25)).resolves.toEqual({
      pedidoId: 25,
      preferenceId: 'pref-123',
      checkoutUrl: 'https://checkout.test/pref-123',
    });

    expect(checkoutService.iniciarPagamento).toHaveBeenCalledWith(10, 25);
    expect(checkoutService.iniciarPagamento).toHaveBeenCalledTimes(1);
  });

  it('deve delegar cancelamento com reembolso para ReembolsoService', async () => {
    reembolsoService.cancelarPedidoComReembolso.mockResolvedValue({
      pedidoId: 25,
      status: 'CANCELADO',
      refunded: true,
      refundId: 'refund-123',
      refundAmount: 75,
    });

    await expect(service.cancelarPedidoComReembolso(25)).resolves.toEqual({
      pedidoId: 25,
      status: 'CANCELADO',
      refunded: true,
      refundId: 'refund-123',
      refundAmount: 75,
    });

    expect(reembolsoService.cancelarPedidoComReembolso).toHaveBeenCalledWith(
      25,
    );
    expect(reembolsoService.cancelarPedidoComReembolso).toHaveBeenCalledTimes(
      1,
    );
  });

  it('deve delegar processamento de webhook para PagamentoWebhookService', async () => {
    pagamentoWebhookService.processarPagamentoWebhook.mockResolvedValue({
      received: true,
      pedidoId: 25,
      paymentId: 'pay-123',
      paymentStatus: 'approved',
    });

    await expect(service.processarPagamentoWebhook('pay-123')).resolves.toEqual(
      {
        received: true,
        pedidoId: 25,
        paymentId: 'pay-123',
        paymentStatus: 'approved',
      },
    );

    expect(
      pagamentoWebhookService.processarPagamentoWebhook,
    ).toHaveBeenCalledWith('pay-123');
    expect(
      pagamentoWebhookService.processarPagamentoWebhook,
    ).toHaveBeenCalledTimes(1);
  });
});
