import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { clienteDefaultSelect } from '../cliente-select';
import { ClienteFilterDto } from '../dto/cliente-filter.dto';

@Injectable()
export class ClienteQueryService {
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
        select: clienteDefaultSelect,
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
      select: clienteDefaultSelect,
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    return cliente;
  }

  async findMe(clienteId: number) {
    return this.findById(clienteId);
  }
}
