import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

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
      }),
    ).rejects.toThrow(new UnauthorizedException('Usuário não encontrado.'));
  });

  it('deve rejeitar token de conta desativada', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      email: 'teste@teste.com',
      role: Role.CLIENTE,
      active: false,
    });

    await expect(
      strategy.validate({
        sub: 10,
        email: 'teste@teste.com',
        role: Role.CLIENTE,
      }),
    ).rejects.toThrow(new UnauthorizedException('Esta conta está desativada.'));
  });

  it('deve retornar os dados atuais do banco para uma conta válida', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      email: 'novo@teste.com',
      role: Role.ADMIN,
      active: true,
    });

    const result = await strategy.validate({
      sub: 10,
      email: 'antigo@teste.com',
      role: Role.CLIENTE,
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
      },
    });

    expect(result).toEqual({
      sub: 10,
      email: 'novo@teste.com',
      role: Role.ADMIN,
    });
  });
});
