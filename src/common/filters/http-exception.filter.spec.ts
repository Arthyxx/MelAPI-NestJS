import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  const jsonMock = jest.fn();
  const statusMock = jest.fn(() => ({
    json: jsonMock,
  }));

  const responseMock = {
    status: statusMock,
  };

  const requestMock = {
    url: '/api/teste',
  };

  const hostMock = {
    switchToHttp: jest.fn(() => ({
      getResponse: jest.fn(
        () => responseMock,
      ),
      getRequest: jest.fn(
        () => requestMock,
      ),
    })),
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    jest.clearAllMocks();

    filter =
      new HttpExceptionFilter();
  });

  it('deve normalizar erro 429', () => {
    const exception =
      new HttpException(
        'ThrottlerException: Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    filter.catch(
      exception,
      hostMock,
    );

    expect(statusMock).toHaveBeenCalledWith(
      HttpStatus.TOO_MANY_REQUESTS,
    );

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        message:
          'Muitas requisições. Aguarde um momento e tente novamente.',
        error:
          'Too Many Requests',
        path: '/api/teste',
        timestamp:
          expect.any(String),
      }),
    );
  });

  it('deve preservar mensagem de uma HttpException conhecida', () => {
    const exception =
      new HttpException(
        {
          statusCode: 404,
          message:
            'Produto não encontrado.',
          error: 'Not Found',
        },
        HttpStatus.NOT_FOUND,
      );

    filter.catch(
      exception,
      hostMock,
    );

    expect(statusMock).toHaveBeenCalledWith(
      HttpStatus.NOT_FOUND,
    );

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message:
          'Produto não encontrado.',
        error: 'Not Found',
        path: '/api/teste',
      }),
    );
  });

  it('deve tratar mensagens de validação em formato de array', () => {
    const exception =
      new HttpException(
        {
          statusCode: 400,
          message: [
            'Nome é obrigatório.',
            'Email inválido.',
          ],
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );

    filter.catch(
      exception,
      hostMock,
    );

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: [
          'Nome é obrigatório.',
          'Email inválido.',
        ],
        error: 'Bad Request',
      }),
    );
  });

  it('não deve expor detalhes de erros internos inesperados', () => {
    const exception =
      new Error(
        'senha_do_banco=segredo',
      );

    filter.catch(
      exception,
      hostMock,
    );

    expect(statusMock).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message:
          'Erro interno no servidor.',
        error:
          'Internal Server Error',
        path: '/api/teste',
      }),
    );

    const responseBody =
      jsonMock.mock.calls[0][0];

    expect(
      JSON.stringify(responseBody),
    ).not.toContain(
      'senha_do_banco',
    );
  });
});