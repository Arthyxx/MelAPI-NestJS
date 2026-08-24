import { Injectable, Logger } from '@nestjs/common';

import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProdutoImageService {
  private readonly logger = new Logger(ProdutoImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async cleanupOrphanImage(publicId: string | null): Promise<void> {
    if (!publicId) {
      return;
    }

    try {
      const produtoVinculado = await this.prisma.produto.findFirst({
        where: {
          imagePublicId: publicId,
        },
        select: {
          id: true,
        },
      });

      if (produtoVinculado) {
        return;
      }
    } catch (error) {
      this.logger.warn(
        `Não foi possível verificar se a imagem "${publicId}" está vinculada a algum produto.`,
        error instanceof Error ? error.message : undefined,
      );

      return;
    }

    await this.cleanupImage(publicId);
  }

  async cleanupReplacedImage(
    oldPublicId: string | null,
    newPublicId: string | null,
  ): Promise<void> {
    if (!oldPublicId || oldPublicId === newPublicId) {
      return;
    }

    await this.cleanupImage(oldPublicId);
  }

  async cleanupImage(publicId: string | null): Promise<void> {
    if (!publicId) {
      return;
    }

    try {
      await this.cloudinaryService.deleteImage(publicId);
    } catch (error) {
      this.logger.warn(
        `Não foi possível remover a imagem "${publicId}" da Cloudinary.`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}
