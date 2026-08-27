import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { CalcularFreteDto } from './dto/calcular-frete.dto';
import { MelhorEnvioService } from './melhor-envio.service';

@Injectable()
export class FreteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly melhorEnvioService: MelhorEnvioService,
  ) {}

  async calcularFrete(dto: CalcularFreteDto) {
    const cotacao = await this.prepararCotacao(dto);

    return this.melhorEnvioService.calcularFrete(cotacao);
  }

  async prepararCotacao(dto: CalcularFreteDto) {
    const destinationZipCode = this.normalizeZipCode(dto.destinationZipCode);

    const originZipCode = this.configService.getOrThrow<string>(
      'SHIPPING_ORIGIN_ZIP_CODE',
    );

    const itemsByProductId = new Map<number, number>();

    for (const item of dto.items) {
      const currentQuantity = itemsByProductId.get(item.productId) ?? 0;

      itemsByProductId.set(item.productId, currentQuantity + item.quantity);
    }

    const productIds = [...itemsByProductId.keys()];

    const products = await this.prisma.produto.findMany({
      where: {
        id: {
          in: productIds,
        },
        active: true,
      },
      select: {
        id: true,
        name: true,
        price: true,
        stockQuantity: true,
        weightKg: true,
        heightCm: true,
        widthCm: true,
        lengthCm: true,
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'Um ou mais produtos estão indisponíveis para cálculo de frete.',
      );
    }

    const items = products.map((product) => {
      const quantity = itemsByProductId.get(product.id);

      if (!quantity) {
        throw new BadRequestException(
          'Quantidade inválida para cálculo de frete.',
        );
      }

      if (product.stockQuantity < quantity) {
        throw new BadRequestException(
          `Estoque insuficiente para o produto "${product.name}".`,
        );
      }

      if (
        product.weightKg === null ||
        product.heightCm === null ||
        product.widthCm === null ||
        product.lengthCm === null
      ) {
        throw new BadRequestException(
          `O produto "${product.name}" não possui peso e dimensões completos para cálculo de frete.`,
        );
      }

      return {
        productId: product.id,

        name: product.name,

        quantity,

        unitValue: Number(product.price),

        weightKg: Number(product.weightKg),

        heightCm: Number(product.heightCm),

        widthCm: Number(product.widthCm),

        lengthCm: Number(product.lengthCm),
      };
    });

    return {
      originZipCode,
      destinationZipCode,
      items,
    };
  }

  private normalizeZipCode(zipCode: string) {
    return zipCode.replace(/\D/g, '');
  }
}
