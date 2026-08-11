import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app =
    await NestFactory.create(AppModule);

  const configService =
    app.get(ConfigService);

  const isProduction =
    configService.get<string>(
      'NODE_ENV',
    ) === 'production';

  app.use(
    helmet({
      contentSecurityPolicy:
        isProduction
          ? undefined
          : false,
    }),
  );

  app.setGlobalPrefix('api');

  app.enableCors({
    origin:
      configService.get<string>(
        'FRONTEND_URL',
      ) ||
      'http://localhost:5173',
    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(
    new HttpExceptionFilter(),
  );

  const config =
    new DocumentBuilder()
      .setTitle('API Mel')
      .setDescription(
        'API para gerenciamento de produtos, clientes e pedidos',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'Authorization',
      )
      .build();

  const document =
    SwaggerModule.createDocument(
      app,
      config,
    );

  SwaggerModule.setup(
    'api/docs',
    app,
    document,
  );

  const port =
    configService.get<number>(
      'PORT',
    ) || 3000;

  await app.listen(port);

  console.log(
    `API rodando em http://localhost:${port}/api`,
  );

  console.log(
    `Swagger disponível em http://localhost:${port}/api/docs`,
  );
}

void bootstrap();