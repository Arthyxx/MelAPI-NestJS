import 'reflect-metadata';

import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  const jwtSecret = '12345678901234567890123456789012';

  function createValidConfig(overrides: Record<string, unknown> = {}) {
    return {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/mel_api',
      JWT_SECRET: jwtSecret,
      JWT_EXPIRES_IN: '1h',
      PORT: 3000,

      CLOUDINARY_CLOUD_NAME: 'mel-api-cloud',
      CLOUDINARY_API_KEY: '123456789012345',
      CLOUDINARY_API_SECRET: 'cloudinary-api-secret-example',

      SHIPPING_ORIGIN_ZIP_CODE: '62300000',

      MELHOR_ENVIO_BASE_URL: 'https://sandbox.melhorenvio.com.br',
      MELHOR_ENVIO_USER_AGENT:
        'Apiario Vitoria Seven (apiariovitoriaseven@gmail.com)',

      MERCADO_PAGO_BASE_URL: 'https://api.mercadopago.com',

      ...overrides,
    };
  }

  function createValidProductionConfig(
    overrides: Record<string, unknown> = {},
  ) {
    return createValidConfig({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://mel-frontend.vercel.app',
      MELHOR_ENVIO_ACCESS_TOKEN: 'melhor-envio-token-producao',
      MERCADO_PAGO_ACCESS_TOKEN: 'mercado-pago-token-producao',
      MERCADO_PAGO_WEBHOOK_SECRET: 'mercado-pago-webhook-secret',
      GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',

      ...overrides,
    });
  }

  it('deve aceitar uma configuração válida de desenvolvimento', () => {
    const result = validateEnvironment(createValidConfig());

    expect(result.NODE_ENV).toBe('development');

    expect(result.DATABASE_URL).toBe(
      'postgresql://user:password@localhost:5432/mel_api',
    );

    expect(result.JWT_SECRET).toBe(jwtSecret);
    expect(result.JWT_EXPIRES_IN).toBe('1h');
    expect(result.PORT).toBe(3000);

    expect(result.CLOUDINARY_CLOUD_NAME).toBe('mel-api-cloud');
    expect(result.CLOUDINARY_API_KEY).toBe('123456789012345');

    expect(result.CLOUDINARY_API_SECRET).toBe('cloudinary-api-secret-example');

    expect(result.SHIPPING_ORIGIN_ZIP_CODE).toBe('62300000');

    expect(result.MELHOR_ENVIO_BASE_URL).toBe(
      'https://sandbox.melhorenvio.com.br',
    );

    expect(result.MELHOR_ENVIO_USER_AGENT).toBe(
      'Apiario Vitoria Seven (apiariovitoriaseven@gmail.com)',
    );

    expect(result.MELHOR_ENVIO_ACCESS_TOKEN).toBeUndefined();

    expect(result.MERCADO_PAGO_BASE_URL).toBe('https://api.mercadopago.com');
  });

  it('deve aceitar token do Melhor Envio quando configurado', () => {
    const result = validateEnvironment(
      createValidConfig({
        MELHOR_ENVIO_ACCESS_TOKEN: 'sandbox-access-token',
      }),
    );

    expect(result.MELHOR_ENVIO_ACCESS_TOKEN).toBe('sandbox-access-token');
  });

  it('deve rejeitar configuração sem DATABASE_URL', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          DATABASE_URL: '',
        }),
      ),
    ).toThrow('Configuração de ambiente inválida:');
  });

  it('deve rejeitar JWT_SECRET com menos de 32 caracteres', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          JWT_SECRET: 'segredo-curto',
        }),
      ),
    ).toThrow('JWT_SECRET deve ter pelo menos 32 caracteres.');
  });

  it('deve rejeitar uma porta inválida', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          PORT: 70000,
        }),
      ),
    ).toThrow('Configuração de ambiente inválida:');
  });

  it('deve aceitar uma configuração válida de produção', () => {
    const result = validateEnvironment(createValidProductionConfig());

    expect(result.NODE_ENV).toBe('production');

    expect(result.FRONTEND_URL).toBe('https://mel-frontend.vercel.app');

    expect(result.MELHOR_ENVIO_ACCESS_TOKEN).toBe(
      'melhor-envio-token-producao',
    );

    expect(result.MERCADO_PAGO_ACCESS_TOKEN).toBe(
      'mercado-pago-token-producao',
    );

    expect(result.MERCADO_PAGO_WEBHOOK_SECRET).toBe(
      'mercado-pago-webhook-secret',
    );

    expect(result.GOOGLE_CLIENT_ID).toBe(
      'google-client-id.apps.googleusercontent.com',
    );
  });

  it('deve exigir todas as variáveis críticas em produção', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          NODE_ENV: 'production',
        }),
      ),
    ).toThrow(
      'variáveis obrigatórias em produção ausentes: FRONTEND_URL, MELHOR_ENVIO_ACCESS_TOKEN, MERCADO_PAGO_ACCESS_TOKEN, MERCADO_PAGO_WEBHOOK_SECRET, GOOGLE_CLIENT_ID.',
    );
  });

  it('deve rejeitar produção sem token do Melhor Envio', () => {
    expect(() =>
      validateEnvironment(
        createValidProductionConfig({
          MELHOR_ENVIO_ACCESS_TOKEN: undefined,
        }),
      ),
    ).toThrow('MELHOR_ENVIO_ACCESS_TOKEN');
  });

  it('deve rejeitar produção sem token do Mercado Pago', () => {
    expect(() =>
      validateEnvironment(
        createValidProductionConfig({
          MERCADO_PAGO_ACCESS_TOKEN: undefined,
        }),
      ),
    ).toThrow('MERCADO_PAGO_ACCESS_TOKEN');
  });

  it('deve rejeitar produção sem segredo do webhook do Mercado Pago', () => {
    expect(() =>
      validateEnvironment(
        createValidProductionConfig({
          MERCADO_PAGO_WEBHOOK_SECRET: undefined,
        }),
      ),
    ).toThrow('MERCADO_PAGO_WEBHOOK_SECRET');
  });

  it('deve rejeitar produção sem GOOGLE_CLIENT_ID', () => {
    expect(() =>
      validateEnvironment(
        createValidProductionConfig({
          GOOGLE_CLIENT_ID: undefined,
        }),
      ),
    ).toThrow('GOOGLE_CLIENT_ID');
  });

  it('deve rejeitar FRONTEND_URL sem HTTPS em produção', () => {
    expect(() =>
      validateEnvironment(
        createValidProductionConfig({
          FRONTEND_URL: 'http://mel-frontend.exemplo.com',
        }),
      ),
    ).toThrow('FRONTEND_URL deve utilizar HTTPS em produção.');
  });

  it('deve rejeitar MERCADO_PAGO_BASE_URL sem HTTPS em produção', () => {
    expect(() =>
      validateEnvironment(
        createValidProductionConfig({
          MERCADO_PAGO_BASE_URL: 'http://api.mercadopago.com',
        }),
      ),
    ).toThrow('MERCADO_PAGO_BASE_URL deve utilizar HTTPS em produção.');
  });

  it('deve rejeitar MELHOR_ENVIO_BASE_URL sem HTTPS em produção', () => {
    expect(() =>
      validateEnvironment(
        createValidProductionConfig({
          MELHOR_ENVIO_BASE_URL: 'http://melhorenvio.com.br',
        }),
      ),
    ).toThrow('MELHOR_ENVIO_BASE_URL deve utilizar HTTPS em produção.');
  });

  it('deve rejeitar configuração sem CLOUDINARY_CLOUD_NAME', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          CLOUDINARY_CLOUD_NAME: '',
        }),
      ),
    ).toThrow('Configuração de ambiente inválida:');
  });

  it('deve rejeitar configuração sem CLOUDINARY_API_KEY', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          CLOUDINARY_API_KEY: '',
        }),
      ),
    ).toThrow('Configuração de ambiente inválida:');
  });

  it('deve rejeitar configuração sem CLOUDINARY_API_SECRET', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          CLOUDINARY_API_SECRET: '',
        }),
      ),
    ).toThrow('Configuração de ambiente inválida:');
  });

  it('deve rejeitar configuração sem SHIPPING_ORIGIN_ZIP_CODE', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          SHIPPING_ORIGIN_ZIP_CODE: '',
        }),
      ),
    ).toThrow('Configuração de ambiente inválida:');
  });

  it('deve rejeitar CEP de origem com formato inválido', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          SHIPPING_ORIGIN_ZIP_CODE: '62300-000',
        }),
      ),
    ).toThrow('SHIPPING_ORIGIN_ZIP_CODE deve conter exatamente 8 números.');
  });

  it('deve rejeitar configuração sem MELHOR_ENVIO_BASE_URL', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          MELHOR_ENVIO_BASE_URL: '',
        }),
      ),
    ).toThrow('Configuração de ambiente inválida:');
  });

  it('deve rejeitar MELHOR_ENVIO_BASE_URL inválida', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          MELHOR_ENVIO_BASE_URL: 'sandbox-melhor-envio',
        }),
      ),
    ).toThrow('MELHOR_ENVIO_BASE_URL deve ser uma URL válida.');
  });

  it('deve rejeitar configuração sem MELHOR_ENVIO_USER_AGENT', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          MELHOR_ENVIO_USER_AGENT: '',
        }),
      ),
    ).toThrow('Configuração de ambiente inválida:');
  });

  it('deve rejeitar MELHOR_ENVIO_ACCESS_TOKEN vazio quando informado', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          MELHOR_ENVIO_ACCESS_TOKEN: '',
        }),
      ),
    ).toThrow('Configuração de ambiente inválida:');
  });

  it('deve rejeitar configuração sem MERCADO_PAGO_BASE_URL', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          MERCADO_PAGO_BASE_URL: '',
        }),
      ),
    ).toThrow('Configuração de ambiente inválida:');
  });

  it('deve rejeitar MERCADO_PAGO_BASE_URL inválida', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          MERCADO_PAGO_BASE_URL: 'mercado-pago',
        }),
      ),
    ).toThrow('MERCADO_PAGO_BASE_URL deve ser uma URL válida.');
  });
});
