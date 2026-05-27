import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : null;

    const normalizedError = this.normalizeError(exceptionResponse, status);

    response.status(status).json({
      statusCode: status,
      message: normalizedError.message,
      error: normalizedError.error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private normalizeError(
    exceptionResponse: string | object | null,
    status: number,
  ) {
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
      case HttpStatus.BAD_REQUEST:
        return 'Requisição inválida.';
      case HttpStatus.UNAUTHORIZED:
        return 'Não autorizado.';
      case HttpStatus.FORBIDDEN:
        return 'Acesso negado.';
      case HttpStatus.NOT_FOUND:
        return 'Recurso não encontrado.';
      case HttpStatus.CONFLICT:
        return 'Conflito na requisição.';
      default:
        return 'Erro interno no servidor.';
    }
  }

  private getDefaultError(status: number) {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      default:
        return 'Internal Server Error';
    }
  }
}