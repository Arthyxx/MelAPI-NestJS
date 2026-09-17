import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';
import { clienteDefaultSelect } from '../cliente-select';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { CreateClienteDto } from '../dto/create-cliente.dto';
import { PatchClienteDto } from '../dto/patch-cliente.dto';

@Injectable()
export class ClienteAccountService {
  constructor(private readonly prisma: PrismaService) {}

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
      select: clienteDefaultSelect,
    });
  }

  async updateMe(clienteId: number, dto: PatchClienteDto) {
    return this.partialUpdate(clienteId, dto);
  }

  async changePassword(clienteId: number, dto: ChangePasswordDto) {
    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id: clienteId,
      },
      select: {
        id: true,
        password: true,
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    if (!cliente.password) {
      throw new BadRequestException(
        'Esta conta não possui senha local. Entre usando sua conta Google.',
      );
    }

    const currentPasswordMatches = await bcrypt.compare(
      dto.currentPassword,
      cliente.password,
    );

    if (!currentPasswordMatches) {
      throw new BadRequestException('Senha atual inválida.');
    }

    const newPasswordMatchesCurrent = await bcrypt.compare(
      dto.newPassword,
      cliente.password,
    );

    if (newPasswordMatchesCurrent) {
      throw new BadRequestException(
        'A nova senha deve ser diferente da senha atual.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.cliente.update({
      where: {
        id: clienteId,
      },
      data: {
        password: hashedPassword,
        tokenVersion: {
          increment: 1,
        },
      },
    });

    return {
      message: 'Senha alterada com sucesso.',
    };
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
        tokenVersion: {
          increment: 1,
        },
        phone: this.normalizeOptional(dto.phone),
        street: this.normalizeOptional(dto.street),
        addressNumber: this.normalizeOptional(dto.addressNumber),
        complement: this.normalizeOptional(dto.complement),
        neighborhood: this.normalizeOptional(dto.neighborhood),
        city: this.normalizeOptional(dto.city),
        state: this.normalizeState(dto.state),
        zipCode: this.normalizeOptional(dto.zipCode),
      },
      select: clienteDefaultSelect,
    });
  }

  async partialUpdate(id: number, dto: PatchClienteDto) {
    await this.ensureClienteExists(id);

    const data: Prisma.ClienteUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
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
      select: clienteDefaultSelect,
    });
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

  private normalizeOptional(value?: string): string | null {
    const normalizedValue = value?.trim();

    return normalizedValue ? normalizedValue : null;
  }

  private normalizeState(value?: string): string | null {
    const normalizedState = value?.trim().toUpperCase();

    return normalizedState ? normalizedState : null;
  }
}
