import 'reflect-metadata';

import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  const jwtSecret =
    'segredo-de-teste-com-mais-de-32-caracteres';

  it('deve aceitar uma configuração válida de desenvolvimento', () => {
    const result =
      validateEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL:
          'postgresql://usuario:senha@localhost:5432/mel',
        JWT_SECRET: jwtSecret,
        JWT_EXPIRES_IN: '1h',
        PORT: '3000',
        FRONTEND_URL:
          'http://localhost:5173',
      });

    expect(result.NODE_ENV).toBe(
      'development',
    );

    expect(result.PORT).toBe(3000);
  });

  it('deve rejeitar configuração sem DATABASE_URL', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        JWT_SECRET: jwtSecret,
        JWT_EXPIRES_IN: '1h',
      }),
    ).toThrow(
      'Configuração de ambiente inválida',
    );
  });

  it('deve rejeitar JWT_SECRET com menos de 32 caracteres', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL:
          'postgresql://teste',
        JWT_SECRET: 'segredo-curto',
        JWT_EXPIRES_IN: '1h',
      }),
    ).toThrow(
      'JWT_SECRET deve ter pelo menos 32 caracteres.',
    );
  });

  it('deve rejeitar uma porta inválida', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL:
          'postgresql://teste',
        JWT_SECRET: jwtSecret,
        JWT_EXPIRES_IN: '1h',
        PORT: '70000',
      }),
    ).toThrow(
      'Configuração de ambiente inválida',
    );
  });

  it('deve exigir FRONTEND_URL em produção', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://teste',
        JWT_SECRET: jwtSecret,
        JWT_EXPIRES_IN: '1h',
      }),
    ).toThrow(
      'FRONTEND_URL é obrigatória em produção.',
    );
  });

  it('deve aceitar produção quando FRONTEND_URL estiver configurada', () => {
    const result =
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://teste',
        JWT_SECRET: jwtSecret,
        JWT_EXPIRES_IN: '1h',
        FRONTEND_URL:
          'https://loja.exemplo.com',
      });

    expect(result.NODE_ENV).toBe(
      'production',
    );

    expect(result.FRONTEND_URL).toBe(
      'https://loja.exemplo.com',
    );
  });
});