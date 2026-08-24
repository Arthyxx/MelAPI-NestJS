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
      ...overrides,
    };
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

  it('deve exigir FRONTEND_URL em produção', () => {
    expect(() =>
      validateEnvironment(
        createValidConfig({
          NODE_ENV: 'production',
        }),
      ),
    ).toThrow('FRONTEND_URL é obrigatória em produção.');
  });

  it('deve aceitar produção quando FRONTEND_URL estiver configurada', () => {
    const result = validateEnvironment(
      createValidConfig({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://mel-frontend.vercel.app',
      }),
    );

    expect(result.NODE_ENV).toBe('production');

    expect(result.FRONTEND_URL).toBe('https://mel-frontend.vercel.app');
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
});
