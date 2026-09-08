import { Role } from '@prisma/client';

import type { AuthUser } from '../common/types/auth-user.type';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';

describe('PagamentosController', () => {
  let controller: PagamentosController;

  const pagamentosService = {
    iniciarPagamento: jest.fn(),
    cancelarPedidoComReembolso: jest.fn(),
    processarPagamentoWebhook: jest.fn(),
  };

  const mercadoPagoWebhookService = {
    validarAssinatura: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new PagamentosController(
      pagamentosService as unknown as PagamentosService,
      mercadoPagoWebhookService as unknown as MercadoPagoWebhookService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('deve iniciar checkout para o usuário autenticado', async () => {
    const user: AuthUser = {
      sub: 10,
      email: 'cliente@teste.com',
      role: Role.CLIENTE,
    };

    pagamentosService.iniciarPagamento.mockResolvedValue({
      pedidoId: 25,
      preferenceId: 'pref-123',
      checkoutUrl: 'https://checkout.teste/pref-123',
    });

    const result = await controller.iniciarPagamento(25, user);

    expect(pagamentosService.iniciarPagamento).toHaveBeenCalledWith(10, 25);

    expect(result).toEqual({
      pedidoId: 25,
      preferenceId: 'pref-123',
      checkoutUrl: 'https://checkout.teste/pref-123',
    });
  });

  it('deve solicitar reembolso administrativo do pedido', async () => {
    pagamentosService.cancelarPedidoComReembolso.mockResolvedValue({
      pedidoId: 25,
      status: 'CANCELADO',
      refunded: true,
      refundId: 'refund-123',
      refundAmount: 75,
    });

    const result = await controller.cancelarPedidoComReembolso(25);

    expect(pagamentosService.cancelarPedidoComReembolso).toHaveBeenCalledWith(
      25,
    );

    expect(result).toEqual({
      pedidoId: 25,
      status: 'CANCELADO',
      refunded: true,
      refundId: 'refund-123',
      refundAmount: 75,
    });
  });

  it('deve validar assinatura e processar webhook de pagamento', async () => {
    mercadoPagoWebhookService.validarAssinatura.mockReturnValue(undefined);

    pagamentosService.processarPagamentoWebhook.mockResolvedValue({
      received: true,
      pedidoId: 25,
      paymentId: '123456',
      paymentStatus: 'approved',
    });

    const result = await controller.receberWebhook(
      'ts=123,v1=assinatura',
      'request-123',
      {
        type: 'payment',
        'data.id': '123456',
      },
    );

    expect(mercadoPagoWebhookService.validarAssinatura).toHaveBeenCalledWith({
      xSignature: 'ts=123,v1=assinatura',
      xRequestId: 'request-123',
      dataId: '123456',
    });

    expect(pagamentosService.processarPagamentoWebhook).toHaveBeenCalledWith(
      '123456',
    );

    expect(result).toEqual({
      received: true,
      pedidoId: 25,
      paymentId: '123456',
      paymentStatus: 'approved',
    });
  });

  it('deve ignorar webhook de tipo diferente de payment depois de validar assinatura', async () => {
    const result = await controller.receberWebhook(
      'ts=123,v1=assinatura',
      'request-123',
      {
        type: 'merchant_order',
        'data.id': '123456',
      },
    );

    expect(mercadoPagoWebhookService.validarAssinatura).toHaveBeenCalled();

    expect(pagamentosService.processarPagamentoWebhook).not.toHaveBeenCalled();

    expect(result).toEqual({
      received: true,
    });
  });

  it('deve aceitar webhook sem data.id sem processar pagamento', async () => {
    const result = await controller.receberWebhook(
      'ts=123,v1=assinatura',
      'request-123',
      {
        type: 'payment',
      },
    );

    expect(mercadoPagoWebhookService.validarAssinatura).toHaveBeenCalledWith({
      xSignature: 'ts=123,v1=assinatura',
      xRequestId: 'request-123',
      dataId: undefined,
    });

    expect(pagamentosService.processarPagamentoWebhook).not.toHaveBeenCalled();

    expect(result).toEqual({
      received: true,
    });
  });
});
