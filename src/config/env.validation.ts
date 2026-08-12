import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsIn([
    'development',
    'production',
    'test',
  ])
  NODE_ENV: string = 'development';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32, {
    message:
      'JWT_SECRET deve ter pelo menos 32 caracteres.',
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
}

export function validateEnvironment(
  config: Record<string, unknown>,
) {
  const validatedConfig =
    plainToInstance(
      EnvironmentVariables,
      config,
      {
        enableImplicitConversion:
          true,
      },
    );

  const errors = validateSync(
    validatedConfig,
    {
      skipMissingProperties: false,
    },
  );

  if (errors.length > 0) {
    const messages = errors
      .flatMap((error) =>
        Object.values(
          error.constraints ?? {},
        ),
      )
      .join('; ');

    throw new Error(
      `Configuração de ambiente inválida: ${messages}`,
    );
  }

  if (
    validatedConfig.NODE_ENV ===
      'production' &&
    !validatedConfig.FRONTEND_URL
  ) {
    throw new Error(
      'Configuração de ambiente inválida: FRONTEND_URL é obrigatória em produção.',
    );
  }

  return validatedConfig;
}