import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { ClientesService } from './clientes.service';

interface ClienteUpdateCall {
  where: {
    id: number;
  };

  data: {
    password?: string;

    tokenVersion?: {
      increment: number;
    };

    active?: boolean;
  };
}

describe('ClientesService', () => {
  let service: ClientesService;

  const prismaMock = {
    cliente: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },

    $transaction: jest.fn(),
  };

  const getClienteUpdateCall = (index = 0): ClienteUpdateCall => {
    const calls = prismaMock.cliente.update.mock.calls as unknown as [
      ClienteUpdateCall,
    ][];

    const call = calls[index];

    if (!call) {
      throw new Error(`cliente.update não foi chamado na posição ${index}.`);
    }

    return call[0];
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientesService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<ClientesService>(ClientesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('não deve permitir que o administrador desative a própria conta', async () => {
    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 2,
      role: Role.ADMIN,
      active: true,
    });

    await expect(
      service.updateAdmin(
        2,
        {
          active: false,
        },
        2,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.cliente.update).not.toHaveBeenCalled();
  });

  it('não deve permitir que o administrador remova o próprio perfil ADMIN', async () => {
    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 2,
      role: Role.ADMIN,
      active: true,
    });

    await expect(
      service.updateAdmin(
        2,
        {
          role: Role.CLIENTE,
        },
        2,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.cliente.update).not.toHaveBeenCalled();
  });

  it('não deve permitir excluir a própria conta administrativa', async () => {
    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 2,
      role: Role.ADMIN,
      active: true,

      _count: {
        pedidos: 0,
      },
    });

    await expect(service.delete(2, 2)).rejects.toThrow(BadRequestException);

    expect(prismaMock.cliente.delete).not.toHaveBeenCalled();
  });

  it('não deve permitir desativar o último administrador ativo', async () => {
    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 7,
      role: Role.ADMIN,
      active: true,
    });

    prismaMock.cliente.count.mockResolvedValue(0);

    await expect(
      service.updateAdmin(
        7,
        {
          active: false,
        },
        2,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prismaMock.cliente.count).toHaveBeenCalledWith({
      where: {
        id: {
          not: 7,
        },

        role: Role.ADMIN,
        active: true,
      },
    });

    expect(prismaMock.cliente.update).not.toHaveBeenCalled();
  });

  it('deve permitir desativar um administrador quando existe outro ativo', async () => {
    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 7,
      role: Role.ADMIN,
      active: true,
    });

    prismaMock.cliente.count.mockResolvedValue(1);

    prismaMock.cliente.update.mockResolvedValue({
      id: 7,
      name: 'Admin Teste',
      email: 'admin.teste@melapi.local',
      role: Role.ADMIN,
      active: false,
    });

    const result = await service.updateAdmin(
      7,
      {
        active: false,
      },
      2,
    );

    expect(prismaMock.cliente.update).toHaveBeenCalled();

    expect(result.active).toBe(false);
  });

  it('deve alterar a senha e incrementar tokenVersion quando a senha atual estiver correta', async () => {
    const currentPassword = 'senhaAtual123';
    const newPassword = 'novaSenha456';

    const currentPasswordHash = await bcrypt.hash(currentPassword, 10);

    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 10,
      password: currentPasswordHash,
    });

    prismaMock.cliente.update.mockResolvedValue({
      id: 10,
    });

    const result = await service.changePassword(10, {
      currentPassword,
      newPassword,
    });

    expect(prismaMock.cliente.findUnique).toHaveBeenCalledWith({
      where: {
        id: 10,
      },

      select: {
        id: true,
        password: true,
      },
    });

    expect(prismaMock.cliente.update).toHaveBeenCalledTimes(1);

    const updateData = getClienteUpdateCall();

    expect(updateData.where).toEqual({
      id: 10,
    });

    expect(updateData.data.password).toBeDefined();

    expect(updateData.data.password).not.toBe(newPassword);

    expect(updateData.data.tokenVersion).toEqual({
      increment: 1,
    });

    const savedPassword = updateData.data.password;

    if (!savedPassword) {
      throw new Error('A senha não foi enviada para atualização.');
    }

    await expect(bcrypt.compare(newPassword, savedPassword)).resolves.toBe(
      true,
    );

    expect(result).toEqual({
      message: 'Senha alterada com sucesso.',
    });
  });

  it('não deve alterar a senha quando a senha atual estiver incorreta', async () => {
    const currentPasswordHash = await bcrypt.hash('senhaCorreta123', 10);

    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 10,
      password: currentPasswordHash,
    });

    await expect(
      service.changePassword(10, {
        currentPassword: 'senhaErrada123',
        newPassword: 'novaSenha456',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(prismaMock.cliente.update).not.toHaveBeenCalled();
  });

  it('não deve permitir que a nova senha seja igual à senha atual', async () => {
    const currentPassword = 'senhaAtual123';

    const currentPasswordHash = await bcrypt.hash(currentPassword, 10);

    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 10,
      password: currentPasswordHash,
    });

    await expect(
      service.changePassword(10, {
        currentPassword,
        newPassword: currentPassword,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.cliente.update).not.toHaveBeenCalled();
  });

  it('não deve permitir troca de senha para conta sem senha local', async () => {
    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 10,
      password: null,
    });

    await expect(
      service.changePassword(10, {
        currentPassword: 'senhaAtual123',
        newPassword: 'novaSenha456',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Esta conta não possui senha local. Entre usando sua conta Google.',
      ),
    );

    expect(prismaMock.cliente.update).not.toHaveBeenCalled();
  });

  it('deve rejeitar troca de senha quando cliente não existir', async () => {
    prismaMock.cliente.findUnique.mockResolvedValue(null);

    await expect(
      service.changePassword(999, {
        currentPassword: 'senhaAtual123',
        newPassword: 'novaSenha456',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prismaMock.cliente.update).not.toHaveBeenCalled();
  });
});
