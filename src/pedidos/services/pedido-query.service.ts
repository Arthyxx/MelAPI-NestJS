import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { PedidoFilterDto } from '../dto/pedido-filter.dto';
import {
  pedidoDefaultInclude,
  toPedidoResponse,
} from '../pedido-response.mapper';

@Injectable()
export class PedidoQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: PedidoFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PedidoWhereInput = {};

    if (filter.status !== undefined) {
      where.status = filter.status;
    }

    const search = filter.search?.trim();

    if (search) {
      const numericSearch = /^\d+$/.test(search) ? Number(search) : null;

      const zipCodeSearch = /^[\d-]+$/.test(search)
        ? search.replace(/\D/g, '')
        : null;

      where.OR = [
        {
          cliente: {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          cliente: {
            email: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          shippingCompanyName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          shippingServiceName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          shippingStreet: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          shippingAddressNumber: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          shippingComplement: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          shippingNeighborhood: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          shippingCity: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          shippingState: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          items: {
            some: {
              produto: {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          },
        },
        ...(zipCodeSearch
          ? [
              {
                shippingZipCode: {
                  contains: zipCodeSearch,
                },
              },
            ]
          : []),
        ...(numericSearch !== null
          ? [
              {
                id: numericSearch,
              },
            ]
          : []),
      ];
    }

    const [pedidos, totalItems] = await this.prisma.$transaction([
      this.prisma.pedido.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: pedidoDefaultInclude,
      }),
      this.prisma.pedido.count({
        where,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return {
      content: pedidos.map((pedido) => toPedidoResponse(pedido)),
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
    const pedido = await this.prisma.pedido.findUnique({
      where: {
        id,
      },
      include: pedidoDefaultInclude,
    });

    if (!pedido) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    return toPedidoResponse(pedido);
  }

  async findMyPedidos(clienteId: number) {
    const pedidos = await this.prisma.pedido.findMany({
      where: {
        clienteId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: pedidoDefaultInclude,
    });

    return pedidos.map((pedido) => toPedidoResponse(pedido));
  }

  async findMyPedidoById(id: number, clienteId: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: {
        id,
      },
      include: pedidoDefaultInclude,
    });

    if (!pedido) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (pedido.clienteId !== clienteId) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este pedido.',
      );
    }

    return toPedidoResponse(pedido);
  }
}
