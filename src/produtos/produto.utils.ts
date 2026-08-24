import { Prisma } from '@prisma/client';

export type ProdutoWithRelations = Prisma.ProdutoGetPayload<{
  include: {
    category: {
      select: {
        id: true;
        name: true;
      };
    };
    avaliacoes: {
      select: {
        rating: true;
      };
    };
  };
}>;

interface ProdutoShippingInput {
  weightKg?: number;
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
}

interface ProdutoShippingData {
  weightKg: Prisma.Decimal | null;
  heightCm: Prisma.Decimal | null;
  widthCm: Prisma.Decimal | null;
  lengthCm: Prisma.Decimal | null;
}

export function buildProdutoShippingData(
  input: ProdutoShippingInput,
): ProdutoShippingData {
  return {
    weightKg:
      input.weightKg !== undefined ? new Prisma.Decimal(input.weightKg) : null,

    heightCm:
      input.heightCm !== undefined ? new Prisma.Decimal(input.heightCm) : null,

    widthCm:
      input.widthCm !== undefined ? new Prisma.Decimal(input.widthCm) : null,

    lengthCm:
      input.lengthCm !== undefined ? new Prisma.Decimal(input.lengthCm) : null,
  };
}

export function buildProdutoShippingPatch(
  input: ProdutoShippingInput,
): Prisma.ProdutoUpdateInput {
  const data: Prisma.ProdutoUpdateInput = {};

  if (input.weightKg !== undefined) {
    data.weightKg = new Prisma.Decimal(input.weightKg);
  }

  if (input.heightCm !== undefined) {
    data.heightCm = new Prisma.Decimal(input.heightCm);
  }

  if (input.widthCm !== undefined) {
    data.widthCm = new Prisma.Decimal(input.widthCm);
  }

  if (input.lengthCm !== undefined) {
    data.lengthCm = new Prisma.Decimal(input.lengthCm);
  }

  return data;
}

export function buildProdutoOrderBy(
  sort?: string,
): Prisma.ProdutoOrderByWithRelationInput {
  if (!sort) {
    return {
      id: 'asc',
    };
  }

  const [field, direction] = sort.split(',');

  if (
    (field === 'price' || field === 'name' || field === 'id') &&
    (direction === 'asc' || direction === 'desc')
  ) {
    return {
      [field]: direction,
    };
  }

  return {
    id: 'asc',
  };
}

export function toProdutoResponse(produto: ProdutoWithRelations) {
  const reviewsCount = produto.avaliacoes.length;

  const averageRating =
    reviewsCount > 0
      ? produto.avaliacoes.reduce(
          (sum, avaliacao) => sum + avaliacao.rating,
          0,
        ) / reviewsCount
      : null;

  return {
    id: produto.id,
    name: produto.name,
    description: produto.description,

    price: Number(produto.price),

    stockQuantity: produto.stockQuantity,

    imageUrl: produto.imageUrl,

    imagePublicId: produto.imagePublicId,

    weightKg: produto.weightKg !== null ? Number(produto.weightKg) : null,

    heightCm: produto.heightCm !== null ? Number(produto.heightCm) : null,

    widthCm: produto.widthCm !== null ? Number(produto.widthCm) : null,

    lengthCm: produto.lengthCm !== null ? Number(produto.lengthCm) : null,

    active: produto.active,
    category: produto.category,

    averageRating,
    reviewsCount,

    createdAt: produto.createdAt,

    updatedAt: produto.updatedAt,
  };
}
