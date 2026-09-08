import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  let prisma: {
    cliente: {
      findUnique: jest.Mock;
    };
  };

  let jwtService: {
    signAsync: jest.Mock;
  };

  const googleAuthService = {
    verifyCredential: jest.fn(),
  };

  const bcryptCompareMock = bcrypt.compare as jest.Mock;

  beforeEach(() => {
    prisma = {
      cliente: {
        findUnique: jest.fn(),
      },
    };

    jwtService = {
      signAsync: jest.fn(),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      googleAuthService as unknown as GoogleAuthService,
    );

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve rejeitar login quando o e-mail não existe', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'inexistente@teste.com',
        password: '123456',
      }),
    ).rejects.toThrow(new UnauthorizedException('E-mail ou senha inválidos.'));

    expect(prisma.cliente.findUnique).toHaveBeenCalledWith({
      where: {
        email: 'inexistente@teste.com',
      },
    });

    expect(bcryptCompareMock).not.toHaveBeenCalled();

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('deve rejeitar login de conta inativa', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      name: 'Cliente Inativo',
      email: 'inativo@teste.com',
      password: 'hash',
      role: Role.CLIENTE,
      active: false,
      tokenVersion: 0,
    });

    await expect(
      service.login({
        email: 'inativo@teste.com',
        password: '123456',
      }),
    ).rejects.toThrow(new UnauthorizedException('E-mail ou senha inválidos.'));

    expect(bcryptCompareMock).not.toHaveBeenCalled();

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('deve rejeitar login quando a senha estiver incorreta', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      name: 'Cliente Teste',
      email: 'cliente@teste.com',
      password: 'hash-salvo',
      role: Role.CLIENTE,
      active: true,
      tokenVersion: 0,
    });

    bcryptCompareMock.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'cliente@teste.com',
        password: 'senha-errada',
      }),
    ).rejects.toThrow(new UnauthorizedException('E-mail ou senha inválidos.'));

    expect(bcryptCompareMock).toHaveBeenCalledWith(
      'senha-errada',
      'hash-salvo',
    );

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('deve normalizar o e-mail antes de buscar o usuário', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: '  CLIENTE@TESTE.COM  ',
        password: '123456',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.cliente.findUnique).toHaveBeenCalledWith({
      where: {
        email: 'cliente@teste.com',
      },
    });
  });

  it('deve gerar JWT com tokenVersion e retornar o usuário em login válido', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      name: 'Cliente Teste',
      email: 'cliente@teste.com',
      password: 'hash-salvo',
      role: Role.CLIENTE,
      active: true,
      tokenVersion: 3,
    });

    bcryptCompareMock.mockResolvedValue(true);

    jwtService.signAsync.mockResolvedValue('token-jwt-teste');

    const result = await service.login({
      email: '  CLIENTE@TESTE.COM ',
      password: 'senha-correta',
    });

    expect(bcryptCompareMock).toHaveBeenCalledWith(
      'senha-correta',
      'hash-salvo',
    );

    expect(jwtService.signAsync).toHaveBeenCalledTimes(1);

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 10,
      email: 'cliente@teste.com',
      role: Role.CLIENTE,
      tokenVersion: 3,
    });

    expect(result).toEqual({
      token: 'token-jwt-teste',

      user: {
        id: 10,
        name: 'Cliente Teste',
        email: 'cliente@teste.com',
        role: Role.CLIENTE,
        active: true,
      },
    });
  });
});
