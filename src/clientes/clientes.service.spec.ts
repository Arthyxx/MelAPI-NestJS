import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClientesService } from './clientes.service';

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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          ClientesService,
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service =
      module.get<ClientesService>(
        ClientesService,
      );
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
    ).rejects.toThrow(
      BadRequestException,
    );

    expect(
      prismaMock.cliente.update,
    ).not.toHaveBeenCalled();
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
    ).rejects.toThrow(
      BadRequestException,
    );

    expect(
      prismaMock.cliente.update,
    ).not.toHaveBeenCalled();
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

    await expect(
      service.delete(2, 2),
    ).rejects.toThrow(
      BadRequestException,
    );

    expect(
      prismaMock.cliente.delete,
    ).not.toHaveBeenCalled();
  });

  it('não deve permitir desativar o último administrador ativo', async () => {
    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 7,
      role: Role.ADMIN,
      active: true,
    });

    prismaMock.cliente.count.mockResolvedValue(
      0,
    );

    await expect(
      service.updateAdmin(
        7,
        {
          active: false,
        },
        2,
      ),
    ).rejects.toThrow(
      ConflictException,
    );

    expect(
      prismaMock.cliente.count,
    ).toHaveBeenCalledWith({
      where: {
        id: {
          not: 7,
        },
        role: Role.ADMIN,
        active: true,
      },
    });

    expect(
      prismaMock.cliente.update,
    ).not.toHaveBeenCalled();
  });

  it('deve permitir desativar um administrador quando existe outro ativo', async () => {
    prismaMock.cliente.findUnique.mockResolvedValue({
      id: 7,
      role: Role.ADMIN,
      active: true,
    });

    prismaMock.cliente.count.mockResolvedValue(
      1,
    );

    prismaMock.cliente.update.mockResolvedValue({
      id: 7,
      name: 'Admin Teste',
      email: 'admin.teste@melapi.local',
      role: Role.ADMIN,
      active: false,
    });

    const result =
      await service.updateAdmin(
        7,
        {
          active: false,
        },
        2,
      );

    expect(
      prismaMock.cliente.update,
    ).toHaveBeenCalled();

    expect(result.active).toBe(false);
  });
});