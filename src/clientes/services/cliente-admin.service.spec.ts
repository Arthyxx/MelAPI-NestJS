import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ClienteAdminService } from './cliente-admin.service';

describe('ClienteAdminService', () => {
  let service: ClienteAdminService;

  const prisma = {
    cliente: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ClienteAdminService(prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('não deve permitir que o administrador desative a própria conta', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
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

    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });

  it('não deve permitir que o administrador remova o próprio perfil ADMIN', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
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

    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });

  it('não deve permitir excluir a própria conta administrativa', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 2,
      role: Role.ADMIN,
      active: true,
      _count: {
        pedidos: 0,
      },
    });

    await expect(service.delete(2, 2)).rejects.toThrow(BadRequestException);

    expect(prisma.cliente.delete).not.toHaveBeenCalled();
  });

  it('não deve permitir desativar o último administrador ativo', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 7,
      role: Role.ADMIN,
      active: true,
    });

    prisma.cliente.count.mockResolvedValue(0);

    await expect(
      service.updateAdmin(
        7,
        {
          active: false,
        },
        2,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.cliente.count).toHaveBeenCalledWith({
      where: {
        id: {
          not: 7,
        },
        role: Role.ADMIN,
        active: true,
      },
    });

    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });

  it('deve permitir desativar um administrador quando existe outro ativo', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 7,
      role: Role.ADMIN,
      active: true,
    });

    prisma.cliente.count.mockResolvedValue(1);

    prisma.cliente.update.mockResolvedValue({
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

    expect(prisma.cliente.update).toHaveBeenCalled();
    expect(result.active).toBe(false);
  });

  it('deve desativar cliente com pedidos em vez de excluir fisicamente', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 9,
      role: Role.CLIENTE,
      active: true,
      _count: {
        pedidos: 3,
      },
    });

    prisma.cliente.update.mockResolvedValue({
      id: 9,
      active: false,
    });

    await service.delete(9, 2);

    expect(prisma.cliente.delete).not.toHaveBeenCalled();
    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: {
        id: 9,
      },
      data: {
        active: false,
      },
    });
  });
});
