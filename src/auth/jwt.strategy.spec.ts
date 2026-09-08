import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

type JwtPayloadInput = Parameters<JwtStrategy['validate']>[0];

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  let prisma: {
    cliente: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      cliente: {
        findUnique: jest.fn(),
      },
    };

    const configService = {
      get: jest.fn().mockReturnValue('segredo-jwt-de-teste'),
    };

    strategy = new JwtStrategy(
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('deve rejeitar token com sub inválido', async () => {
    await expect(
      strategy.validate({
        sub: 0,
        email: 'teste@teste.com',
        role: Role.CLIENTE,
        tokenVersion: 0,
      }),
    ).rejects.toThrow(new UnauthorizedException('Token inválido.'));

    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
  });

  it('deve rejeitar token sem tokenVersion', async () => {
    const payload = {
      sub: 10,
      email: 'teste@teste.com',
      role: Role.CLIENTE,
    } as unknown as JwtPayloadInput;

    await expect(strategy.validate(payload)).rejects.toThrow(
      new UnauthorizedException('Token inválido.'),
    );

    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
  });

  it('deve rejeitar token com tokenVersion negativo', async () => {
    await expect(
      strategy.validate({
        sub: 10,
        email: 'teste@teste.com',
        role: Role.CLIENTE,
        tokenVersion: -1,
      }),
    ).rejects.toThrow(new UnauthorizedException('Token inválido.'));

    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
  });

  it('deve rejeitar token quando o usuário não existir mais', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 10,
        email: 'teste@teste.com',
        role: Role.CLIENTE,
        tokenVersion: 0,
      }),
    ).rejects.toThrow(new UnauthorizedException('Usuário não encontrado.'));
  });

  it('deve rejeitar token de conta desativada', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      email: 'teste@teste.com',
      role: Role.CLIENTE,
      active: false,
      tokenVersion: 0,
    });

    await expect(
      strategy.validate({
        sub: 10,
        email: 'teste@teste.com',
        role: Role.CLIENTE,
        tokenVersion: 0,
      }),
    ).rejects.toThrow(new UnauthorizedException('Esta conta está desativada.'));
  });

  it('deve rejeitar token antigo quando tokenVersion da conta mudar', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      email: 'teste@teste.com',
      role: Role.CLIENTE,
      active: true,
      tokenVersion: 2,
    });

    await expect(
      strategy.validate({
        sub: 10,
        email: 'teste@teste.com',
        role: Role.CLIENTE,
        tokenVersion: 1,
      }),
    ).rejects.toThrow(
      new UnauthorizedException(
        'Sua sessão não é mais válida. Faça login novamente.',
      ),
    );
  });

  it('deve retornar os dados atuais do banco para uma conta válida', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      email: 'novo@teste.com',
      role: Role.ADMIN,
      active: true,
      tokenVersion: 3,
    });

    const result = await strategy.validate({
      sub: 10,
      email: 'antigo@teste.com',
      role: Role.CLIENTE,
      tokenVersion: 3,
    });

    expect(prisma.cliente.findUnique).toHaveBeenCalledWith({
      where: {
        id: 10,
      },

      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        tokenVersion: true,
      },
    });

    expect(result).toEqual({
      sub: 10,
      email: 'novo@teste.com',
      role: Role.ADMIN,
    });
  });
});
