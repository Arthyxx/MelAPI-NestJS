import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32, {
    message: 'JWT_SECRET deve ter pelo menos 32 caracteres.',
  })
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  FRONTEND_URL?: string;

  @IsString()
  @IsNotEmpty()
  CLOUDINARY_CLOUD_NAME!: string;

  @IsString()
  @IsNotEmpty()
  CLOUDINARY_API_KEY!: string;

  @IsString()
  @IsNotEmpty()
  CLOUDINARY_API_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{8}$/, {
    message: 'SHIPPING_ORIGIN_ZIP_CODE deve conter exatamente 8 números.',
  })
  SHIPPING_ORIGIN_ZIP_CODE!: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
    },
    {
      message: 'MELHOR_ENVIO_BASE_URL deve ser uma URL válida.',
    },
  )
  MELHOR_ENVIO_BASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  MELHOR_ENVIO_USER_AGENT!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  MELHOR_ENVIO_ACCESS_TOKEN?: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
    },
    {
      message: 'MERCADO_PAGO_BASE_URL deve ser uma URL válida.',
    },
  )
  MERCADO_PAGO_BASE_URL!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  MERCADO_PAGO_ACCESS_TOKEN?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  MERCADO_PAGO_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  PENDING_ORDER_EXPIRATION_MINUTES: number = 30;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join('; ');

    throw new Error(`Configuração de ambiente inválida: ${messages}`);
  }

  if (validatedConfig.NODE_ENV === 'production') {
    validateProductionEnvironment(validatedConfig);
  }

  return validatedConfig;
}

function validateProductionEnvironment(config: EnvironmentVariables) {
  const requiredProductionVariables: Array<{
    name: string;
    value: string | undefined;
  }> = [
    {
      name: 'FRONTEND_URL',
      value: config.FRONTEND_URL,
    },
    {
      name: 'MELHOR_ENVIO_ACCESS_TOKEN',
      value: config.MELHOR_ENVIO_ACCESS_TOKEN,
    },
    {
      name: 'MERCADO_PAGO_ACCESS_TOKEN',
      value: config.MERCADO_PAGO_ACCESS_TOKEN,
    },
    {
      name: 'MERCADO_PAGO_WEBHOOK_SECRET',
      value: config.MERCADO_PAGO_WEBHOOK_SECRET,
    },
    {
      name: 'GOOGLE_CLIENT_ID',
      value: config.GOOGLE_CLIENT_ID,
    },
  ];

  const missingVariables = requiredProductionVariables
    .filter(({ value }) => !value?.trim())
    .map(({ name }) => name);

  if (missingVariables.length > 0) {
    throw new Error(
      `Configuração de ambiente inválida: variáveis obrigatórias em produção ausentes: ${missingVariables.join(
        ', ',
      )}.`,
    );
  }

  if (!config.FRONTEND_URL) {
    return;
  }

  let frontendUrl: URL;

  try {
    frontendUrl = new URL(config.FRONTEND_URL);
  } catch {
    throw new Error(
      'Configuração de ambiente inválida: FRONTEND_URL deve ser uma URL válida em produção.',
    );
  }

  if (frontendUrl.protocol !== 'https:') {
    throw new Error(
      'Configuração de ambiente inválida: FRONTEND_URL deve utilizar HTTPS em produção.',
    );
  }

  validateHttpsIntegrationUrl(
    config.MERCADO_PAGO_BASE_URL,
    'MERCADO_PAGO_BASE_URL',
  );

  validateHttpsIntegrationUrl(
    config.MELHOR_ENVIO_BASE_URL,
    'MELHOR_ENVIO_BASE_URL',
  );
}

function validateHttpsIntegrationUrl(value: string, variableName: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `Configuração de ambiente inválida: ${variableName} deve ser uma URL válida.`,
    );
  }

  if (url.protocol !== 'https:') {
    throw new Error(
      `Configuração de ambiente inválida: ${variableName} deve utilizar HTTPS em produção.`,
    );
  }
}
