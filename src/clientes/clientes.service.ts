import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAdminClienteDto,
  UpdateAdminClienteDto,
} from './dto/admin-cliente.dto';
import { ClienteFilterDto } from './dto/cliente-filter.dto';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { PatchClienteDto } from './dto/patch-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: ClienteFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ClienteWhereInput = {};

    const search = filter.search?.trim();

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          phone: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          city: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (filter.role !== undefined) {
      where.role = filter.role;
    }

    if (filter.active !== undefined) {
      where.active = filter.active;
    }

    const [clientes, totalItems] = await this.prisma.$transaction([
      this.prisma.cliente.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          id: 'asc',
        },
        select: this.defaultSelect(),
      }),

      this.prisma.cliente.count({
        where,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return {
      content: clientes,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findById(id: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id,
      },
      select: this.defaultSelect(),
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    return cliente;
  }

  async findMe(clienteId: number) {
    return this.findById(clienteId);
  }

  async create(dto: CreateClienteDto) {
    const email = dto.email.trim().toLowerCase();

    await this.ensureEmailIsAvailable(email);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.cliente.create({
      data: {
        name: dto.name.trim(),
        email,
        password: hashedPassword,
        role: Role.CLIENTE,
        active: true,
        phone: this.normalizeOptional(dto.phone),
        street: this.normalizeOptional(dto.street),
        addressNumber: this.normalizeOptional(dto.addressNumber),
        complement: this.normalizeOptional(dto.complement),
        neighborhood: this.normalizeOptional(dto.neighborhood),
        city: this.normalizeOptional(dto.city),
        state: this.normalizeState(dto.state),
        zipCode: this.normalizeOptional(dto.zipCode),
      },
      select: this.defaultSelect(),
    });
  }

  async createAdmin(dto: CreateAdminClienteDto) {
    const email = dto.email.trim().toLowerCase();

    await this.ensureEmailIsAvailable(email);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.cliente.create({
      data: {
        name: dto.name.trim(),
        email,
        password: hashedPassword,
        role: dto.role ?? Role.CLIENTE,
        active: dto.active ?? true,
        phone: this.normalizeOptional(dto.phone),
        street: this.normalizeOptional(dto.street),
        addressNumber: this.normalizeOptional(dto.addressNumber),
        complement: this.normalizeOptional(dto.complement),
        neighborhood: this.normalizeOptional(dto.neighborhood),
        city: this.normalizeOptional(dto.city),
        state: this.normalizeState(dto.state),
        zipCode: this.normalizeOptional(dto.zipCode),
      },
      select: this.defaultSelect(),
    });
  }

  async updateMe(clienteId: number, dto: PatchClienteDto) {
    return this.partialUpdate(clienteId, dto);
  }

  async updateAdmin(
    id: number,
    dto: UpdateAdminClienteDto,
    currentAdminId: number,
  ) {
    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        role: true,
        active: true,
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    if (id === currentAdminId && dto.active === false) {
      throw new BadRequestException(
        'Você não pode desativar a própria conta administrativa.',
      );
    }

    if (id === currentAdminId && dto.role === Role.CLIENTE) {
      throw new BadRequestException(
        'Você não pode remover o próprio perfil de administrador.',
      );
    }

    const resultingRole = dto.role ?? cliente.role;

    const resultingActive = dto.active ?? cliente.active;

    const isRemovingActiveAdmin =
      cliente.role === Role.ADMIN &&
      cliente.active &&
      (resultingRole !== Role.ADMIN || !resultingActive);

    if (isRemovingActiveAdmin) {
      await this.ensureAnotherActiveAdminExists(id);
    }

    const data: Prisma.ClienteUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();

      await this.ensureEmailIsAvailable(email, id);

      data.email = email;
    }

    if (dto.password !== undefined) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.role !== undefined) {
      data.role = dto.role;
    }

    if (dto.active !== undefined) {
      data.active = dto.active;
    }

    if (dto.phone !== undefined) {
      data.phone = this.normalizeOptional(dto.phone);
    }

    if (dto.street !== undefined) {
      data.street = this.normalizeOptional(dto.street);
    }

    if (dto.addressNumber !== undefined) {
      data.addressNumber = this.normalizeOptional(dto.addressNumber);
    }

    if (dto.complement !== undefined) {
      data.complement = this.normalizeOptional(dto.complement);
    }

    if (dto.neighborhood !== undefined) {
      data.neighborhood = this.normalizeOptional(dto.neighborhood);
    }

    if (dto.city !== undefined) {
      data.city = this.normalizeOptional(dto.city);
    }

    if (dto.state !== undefined) {
      data.state = this.normalizeState(dto.state);
    }

    if (dto.zipCode !== undefined) {
      data.zipCode = this.normalizeOptional(dto.zipCode);
    }

    return this.prisma.cliente.update({
      where: {
        id,
      },
      data,
      select: this.defaultSelect(),
    });
  }

  async update(id: number, dto: CreateClienteDto) {
    const email = dto.email.trim().toLowerCase();

    await this.ensureClienteExists(id);

    await this.ensureEmailIsAvailable(email, id);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.cliente.update({
      where: {
        id,
      },
      data: {
        name: dto.name.trim(),
        email,
        password: hashedPassword,
        phone: this.normalizeOptional(dto.phone),
        street: this.normalizeOptional(dto.street),
        addressNumber: this.normalizeOptional(dto.addressNumber),
        complement: this.normalizeOptional(dto.complement),
        neighborhood: this.normalizeOptional(dto.neighborhood),
        city: this.normalizeOptional(dto.city),
        state: this.normalizeState(dto.state),
        zipCode: this.normalizeOptional(dto.zipCode),
      },
      select: this.defaultSelect(),
    });
  }

  async partialUpdate(id: number, dto: PatchClienteDto) {
    await this.ensureClienteExists(id);

    const data: Prisma.ClienteUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();

      await this.ensureEmailIsAvailable(email, id);

      data.email = email;
    }

    if (dto.password !== undefined) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.phone !== undefined) {
      data.phone = this.normalizeOptional(dto.phone);
    }

    if (dto.street !== undefined) {
      data.street = this.normalizeOptional(dto.street);
    }

    if (dto.addressNumber !== undefined) {
      data.addressNumber = this.normalizeOptional(dto.addressNumber);
    }

    if (dto.complement !== undefined) {
      data.complement = this.normalizeOptional(dto.complement);
    }

    if (dto.neighborhood !== undefined) {
      data.neighborhood = this.normalizeOptional(dto.neighborhood);
    }

    if (dto.city !== undefined) {
      data.city = this.normalizeOptional(dto.city);
    }

    if (dto.state !== undefined) {
      data.state = this.normalizeState(dto.state);
    }

    if (dto.zipCode !== undefined) {
      data.zipCode = this.normalizeOptional(dto.zipCode);
    }

    return this.prisma.cliente.update({
      where: {
        id,
      },
      data,
      select: this.defaultSelect(),
    });
  }

  async delete(id: number, currentAdminId: number): Promise<void> {
    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        role: true,
        active: true,
        _count: {
          select: {
            pedidos: true,
          },
        },
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    if (id === currentAdminId) {
      throw new BadRequestException(
        'Você não pode excluir a própria conta administrativa.',
      );
    }

    if (cliente.role === Role.ADMIN && cliente.active) {
      await this.ensureAnotherActiveAdminExists(id);
    }

    if (cliente._count.pedidos > 0) {
      await this.deactivateCliente(id);
      return;
    }

    try {
      await this.prisma.cliente.delete({
        where: {
          id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        await this.deactivateCliente(id);
        return;
      }

      throw error;
    }
  }

  private async ensureClienteExists(id: number): Promise<void> {
    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado.');
    }
  }

  private async ensureEmailIsAvailable(
    email: string,
    ignoreClienteId?: number,
  ): Promise<void> {
    const cliente = await this.prisma.cliente.findFirst({
      where: {
        email,
        NOT:
          ignoreClienteId !== undefined
            ? {
                id: ignoreClienteId,
              }
            : undefined,
      },
      select: {
        id: true,
      },
    });

    if (cliente) {
      throw new ConflictException('Este e-mail já está em uso.');
    }
  }

  private async ensureAnotherActiveAdminExists(adminId: number): Promise<void> {
    const otherActiveAdmins = await this.prisma.cliente.count({
      where: {
        id: {
          not: adminId,
        },
        role: Role.ADMIN,
        active: true,
      },
    });

    if (otherActiveAdmins === 0) {
      throw new ConflictException(
        'A operação não pode ser realizada porque o sistema precisa manter pelo menos um administrador ativo.',
      );
    }
  }

  private async deactivateCliente(id: number): Promise<void> {
    await this.prisma.cliente.update({
      where: {
        id,
      },
      data: {
        active: false,
      },
    });
  }

  private normalizeOptional(value?: string): string | null {
    const normalizedValue = value?.trim();

    return normalizedValue ? normalizedValue : null;
  }

  private normalizeState(value?: string): string | null {
    const normalizedState = value?.trim().toUpperCase();

    return normalizedState ? normalizedState : null;
  }

  private defaultSelect() {
    return {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      phone: true,
      street: true,
      addressNumber: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
      zipCode: true,
      createdAt: true,
      updatedAt: true,
    };
  }
}
