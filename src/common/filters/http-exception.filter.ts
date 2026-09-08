import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();

    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : Number(HttpStatus.INTERNAL_SERVER_ERROR);

    const requestPath = this.getSafeRequestPath(request);

    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logInternalError(exception, request, requestPath);
    }

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const normalizedError = this.normalizeError(exceptionResponse, status);

    response.status(status).json({
      statusCode: status,
      message: normalizedError.message,
      error: normalizedError.error,
      timestamp: new Date().toISOString(),
      path: requestPath,
    });
  }

  private logInternalError(
    exception: unknown,
    request: Request,
    requestPath: string,
  ) {
    const method = request.method || 'UNKNOWN';
    const requestContext = `${method} ${requestPath}`;

    if (exception instanceof Error) {
      const safeStack = this.getSafeStack(exception);

      this.logger.error(
        `Erro interno não tratado em ${requestContext} (${exception.name}).`,
        safeStack,
      );

      return;
    }

    this.logger.error(`Erro interno não tratado em ${requestContext}.`);
  }

  private getSafeStack(exception: Error) {
    if (!exception.stack) {
      return undefined;
    }

    const stackLines = exception.stack.split('\n');

    if (stackLines.length <= 1) {
      return undefined;
    }

    return stackLines.slice(1).join('\n');
  }

  private getSafeRequestPath(request: Request) {
    if (request.path) {
      return request.path;
    }

    return request.url.split('?')[0];
  }

  private normalizeError(
    exceptionResponse: string | object | null,
    status: number,
  ) {
    if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
      return {
        message: 'Muitas requisições. Aguarde um momento e tente novamente.',
        error: 'Too Many Requests',
      };
    }

    if (typeof exceptionResponse === 'string') {
      return {
        message: exceptionResponse,
        error: this.getDefaultError(status),
      };
    }

    if (exceptionResponse && typeof exceptionResponse === 'object') {
      const response = exceptionResponse as ErrorResponse;

      return {
        message: Array.isArray(response.message)
          ? response.message
          : response.message || this.getDefaultMessage(status),

        error: response.error || this.getDefaultError(status),
      };
    }

    return {
      message: 'Erro interno no servidor.',
      error: 'Internal Server Error',
    };
  }

  private getDefaultMessage(status: number) {
    switch (status) {
      case Number(HttpStatus.BAD_REQUEST):
        return 'Requisição inválida.';

      case Number(HttpStatus.UNAUTHORIZED):
        return 'Não autorizado.';

      case Number(HttpStatus.FORBIDDEN):
        return 'Acesso negado.';

      case Number(HttpStatus.NOT_FOUND):
        return 'Recurso não encontrado.';

      case Number(HttpStatus.CONFLICT):
        return 'Conflito na requisição.';

      case Number(HttpStatus.TOO_MANY_REQUESTS):
        return 'Muitas requisições. Aguarde um momento e tente novamente.';

      default:
        return 'Erro interno no servidor.';
    }
  }

  private getDefaultError(status: number) {
    switch (status) {
      case Number(HttpStatus.BAD_REQUEST):
        return 'Bad Request';

      case Number(HttpStatus.UNAUTHORIZED):
        return 'Unauthorized';

      case Number(HttpStatus.FORBIDDEN):
        return 'Forbidden';

      case Number(HttpStatus.NOT_FOUND):
        return 'Not Found';

      case Number(HttpStatus.CONFLICT):
        return 'Conflict';

      case Number(HttpStatus.TOO_MANY_REQUESTS):
        return 'Too Many Requests';

      default:
        return 'Internal Server Error';
    }
  }
}
