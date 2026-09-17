import { Prisma } from '@prisma/client';

export const pedidoDefaultInclude = {
  cliente: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },

  items: {
    include: {
      produto: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
    },
  },
} satisfies Prisma.PedidoInclude;

export type PedidoWithDefaultRelations = Prisma.PedidoGetPayload<{
  include: typeof pedidoDefaultInclude;
}>;

export function toPedidoResponse(pedido: PedidoWithDefaultRelations) {
  return {
    id: pedido.id,
    status: pedido.status,

    totalPrice: Number(pedido.totalPrice),

    shippingPrice: Number(pedido.shippingPrice),

    paymentExpiresAt: pedido.paymentExpiresAt,

    shipping: {
      serviceId: pedido.shippingServiceId,

      serviceName: pedido.shippingServiceName,

      companyName: pedido.shippingCompanyName,

      deliveryTime: pedido.shippingDeliveryTime,

      address: {
        zipCode: pedido.shippingZipCode,

        street: pedido.shippingStreet,

        addressNumber: pedido.shippingAddressNumber,

        complement: pedido.shippingComplement,

        neighborhood: pedido.shippingNeighborhood,

        city: pedido.shippingCity,

        state: pedido.shippingState,
      },
    },

    clienteId: pedido.clienteId,

    clienteName: pedido.cliente.name,

    clienteEmail: pedido.cliente.email,

    items: pedido.items.map((item) => ({
      id: item.id,

      produtoId: item.produtoId,

      produtoName: item.produto.name,

      imageUrl: item.produto.imageUrl,

      quantity: item.quantity,

      unitPrice: Number(item.unitPrice),

      subtotal: Number(item.subtotal),
    })),

    createdAt: pedido.createdAt,

    updatedAt: pedido.updatedAt,
  };
}
