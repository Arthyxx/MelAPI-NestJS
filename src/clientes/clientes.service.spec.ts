import { Role } from '@prisma/client';

import { ClientesService } from './clientes.service';
import { ClienteAccountService } from './services/cliente-account.service';
import { ClienteAdminService } from './services/cliente-admin.service';
import { ClienteQueryService } from './services/cliente-query.service';

describe('ClientesService', () => {
  let service: ClientesService;

  const clienteQueryService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findMe: jest.fn(),
  };

  const clienteAccountService = {
    create: jest.fn(),
    updateMe: jest.fn(),
    changePassword: jest.fn(),
    update: jest.fn(),
    partialUpdate: jest.fn(),
  };

  const clienteAdminService = {
    createAdmin: jest.fn(),
    updateAdmin: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ClientesService(
      clienteQueryService as unknown as ClienteQueryService,
      clienteAccountService as unknown as ClienteAccountService,
      clienteAdminService as unknown as ClienteAdminService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve delegar consultas para ClienteQueryService', async () => {
    clienteQueryService.findAll.mockResolvedValue({ content: [] });
    clienteQueryService.findById.mockResolvedValue({ id: 1 });
    clienteQueryService.findMe.mockResolvedValue({ id: 1 });

    await service.findAll({ page: 1, limit: 10 });
    await service.findById(1);
    await service.findMe(1);

    expect(clienteQueryService.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
    });
    expect(clienteQueryService.findById).toHaveBeenCalledWith(1);
    expect(clienteQueryService.findMe).toHaveBeenCalledWith(1);
  });

  it('deve delegar operações de conta para ClienteAccountService', async () => {
    const createDto = {
      name: 'Cliente Teste',
      email: 'cliente@teste.com',
      password: 'Senha123!',
      phone: '85999999999',
      street: 'Rua Teste',
      addressNumber: '100',
      complement: '',
      neighborhood: 'Centro',
      city: 'Fortaleza',
      state: 'CE',
      zipCode: '60421410',
    };

    const patchDto = {
      name: 'Cliente Atualizado',
    };

    clienteAccountService.create.mockResolvedValue({ id: 1 });
    clienteAccountService.updateMe.mockResolvedValue({ id: 1 });
    clienteAccountService.changePassword.mockResolvedValue({
      message: 'Senha alterada com sucesso.',
    });
    clienteAccountService.update.mockResolvedValue({ id: 1 });
    clienteAccountService.partialUpdate.mockResolvedValue({ id: 1 });

    await service.create(createDto);
    await service.updateMe(1, patchDto);
    await service.changePassword(1, {
      currentPassword: 'Senha123!',
      newPassword: 'NovaSenha456!',
    });
    await service.update(1, createDto);
    await service.partialUpdate(1, patchDto);

    expect(clienteAccountService.create).toHaveBeenCalledWith(createDto);
    expect(clienteAccountService.updateMe).toHaveBeenCalledWith(1, patchDto);
    expect(clienteAccountService.changePassword).toHaveBeenCalledWith(1, {
      currentPassword: 'Senha123!',
      newPassword: 'NovaSenha456!',
    });
    expect(clienteAccountService.update).toHaveBeenCalledWith(1, createDto);
    expect(clienteAccountService.partialUpdate).toHaveBeenCalledWith(
      1,
      patchDto,
    );
  });

  it('deve delegar operações administrativas para ClienteAdminService', async () => {
    const createDto = {
      name: 'Admin Teste',
      email: 'admin@teste.com',
      password: 'Senha123!',
      role: Role.ADMIN,
      active: true,
    };

    const updateDto = {
      active: false,
    };

    clienteAdminService.createAdmin.mockResolvedValue({ id: 7 });
    clienteAdminService.updateAdmin.mockResolvedValue({
      id: 7,
      active: false,
    });
    clienteAdminService.delete.mockResolvedValue(undefined);

    await service.createAdmin(createDto);
    await service.updateAdmin(7, updateDto, 2);
    await service.delete(7, 2);

    expect(clienteAdminService.createAdmin).toHaveBeenCalledWith(createDto);
    expect(clienteAdminService.updateAdmin).toHaveBeenCalledWith(
      7,
      updateDto,
      2,
    );
    expect(clienteAdminService.delete).toHaveBeenCalledWith(7, 2);
  });
});
