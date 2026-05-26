import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { PatchClienteDto } from './dto/patch-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.cliente.findMany({
      orderBy: { id: 'asc' },
      select: this.defaultSelect(),
    });
  }

  async findById(id: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
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

    const emailAlreadyExists = await this.prisma.cliente.findUnique({
      where: { email },
    });

    if (emailAlreadyExists) {
      throw new ConflictException('Já existe um cliente com este e-mail.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.cliente.create({
      data: {
        name: dto.name.trim(),
        email,
        password: hashedPassword,
        role: Role.CLIENTE,
      },
      select: this.defaultSelect(),
    });
  }

  async updateMe(clienteId: number, dto: PatchClienteDto) {
    return this.partialUpdate(clienteId, dto);
  }

  async update(id: number, dto: CreateClienteDto) {
    const email = dto.email.trim().toLowerCase();

    await this.ensureClienteExists(id);

    await this.ensureEmailIsAvailable(email, id);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.cliente.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        email,
        password: hashedPassword,
      },
      select: this.defaultSelect(),
    });
  }

  async partialUpdate(id: number, dto: PatchClienteDto) {
    await this.ensureClienteExists(id);

    const data: {
      name?: string;
      email?: string;
      password?: string;
    } = {};

    if (dto.name) {
      data.name = dto.name.trim();
    }

    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      await this.ensureEmailIsAvailable(email, id);
      data.email = email;
    }

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.cliente.update({
      where: { id },
      data,
      select: this.defaultSelect(),
    });
  }

  async delete(id: number) {
    await this.ensureClienteExists(id);

    await this.prisma.cliente.delete({
      where: { id },
    });
  }

  private async ensureClienteExists(id: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado.');
    }
  }

  private async ensureEmailIsAvailable(email: string, ignoreClienteId?: number) {
    const cliente = await this.prisma.cliente.findFirst({
      where: {
        email,
        NOT: ignoreClienteId ? { id: ignoreClienteId } : undefined,
      },
      select: { id: true },
    });

    if (cliente) {
      throw new ConflictException('Este e-mail já está em uso.');
    }
  }

  private defaultSelect() {
    return {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    };
  }
}