import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

import { ClienteAccountService } from './cliente-account.service';

interface ClienteUpdateCall {
  where: {
    id: number;
  };
  data: {
    password?: string;
    tokenVersion?: {
      increment: number;
    };
  };
}

describe('ClienteAccountService', () => {
  let service: ClienteAccountService;

  const prisma = {
    cliente: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const getClienteUpdateCall = (index = 0): ClienteUpdateCall => {
    const calls = prisma.cliente.update.mock.calls as unknown as Array<
      [ClienteUpdateCall]
    >;

    const call = calls[index];

    if (!call) {
      throw new Error(`cliente.update não foi chamado na posição ${index}.`);
    }

    return call[0];
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ClienteAccountService(prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve alterar a senha e incrementar tokenVersion quando a senha atual estiver correta', async () => {
    const currentPassword = 'senhaAtual123';
    const newPassword = 'novaSenha456';

    const currentPasswordHash = await bcrypt.hash(currentPassword, 10);

    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      password: currentPasswordHash,
    });

    prisma.cliente.update.mockResolvedValue({
      id: 10,
    });

    const result = await service.changePassword(10, {
      currentPassword,
      newPassword,
    });

    expect(prisma.cliente.findUnique).toHaveBeenCalledWith({
      where: {
        id: 10,
      },
      select: {
        id: true,
        password: true,
      },
    });

    expect(prisma.cliente.update).toHaveBeenCalledTimes(1);

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

  it('deve retornar erro 400 sem alterar senha ou tokenVersion quando a senha atual estiver incorreta', async () => {
    const currentPasswordHash = await bcrypt.hash('senhaCorreta123', 10);

    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      password: currentPasswordHash,
    });

    const result = service.changePassword(10, {
      currentPassword: 'senhaErrada123',
      newPassword: 'novaSenha456',
    });

    await expect(result).rejects.toBeInstanceOf(BadRequestException);

    await expect(result).rejects.toMatchObject({
      message: 'Senha atual inválida.',
      response: {
        statusCode: 400,
        message: 'Senha atual inválida.',
      },
    });

    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });

  it('não deve permitir que a nova senha seja igual à senha atual', async () => {
    const currentPassword = 'senhaAtual123';
    const currentPasswordHash = await bcrypt.hash(currentPassword, 10);

    prisma.cliente.findUnique.mockResolvedValue({
      id: 10,
      password: currentPasswordHash,
    });

    await expect(
      service.changePassword(10, {
        currentPassword,
        newPassword: currentPassword,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });

  it('não deve permitir troca de senha para conta sem senha local', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
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

    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });

  it('deve rejeitar troca de senha quando cliente não existir', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);

    await expect(
      service.changePassword(999, {
        currentPassword: 'senhaAtual123',
        newPassword: 'novaSenha456',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });
});
