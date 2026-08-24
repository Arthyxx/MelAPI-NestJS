import { Logger } from '@nestjs/common';

import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProdutoImageService } from './produto-image.service';

describe('ProdutoImageService', () => {
  let service: ProdutoImageService;

  let prisma: {
    produto: {
      findFirst: jest.Mock;
    };
  };

  let cloudinaryService: {
    deleteImage: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      produto: {
        findFirst: jest.fn(),
      },
    };

    cloudinaryService = {
      deleteImage: jest.fn().mockResolvedValue(undefined),
    };

    service = new ProdutoImageService(
      prisma as unknown as PrismaService,
      cloudinaryService as unknown as CloudinaryService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('não deve fazer nada quando o publicId da imagem órfã for nulo', async () => {
    await service.cleanupOrphanImage(null);

    expect(prisma.produto.findFirst).not.toHaveBeenCalled();

    expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();
  });

  it('deve remover imagem órfã quando nenhum produto estiver vinculado', async () => {
    prisma.produto.findFirst.mockResolvedValue(null);

    await service.cleanupOrphanImage('mel-api/produtos/imagem-orfao');

    expect(prisma.produto.findFirst).toHaveBeenCalledWith({
      where: {
        imagePublicId: 'mel-api/produtos/imagem-orfao',
      },
      select: {
        id: true,
      },
    });

    expect(cloudinaryService.deleteImage).toHaveBeenCalledTimes(1);

    expect(cloudinaryService.deleteImage).toHaveBeenCalledWith(
      'mel-api/produtos/imagem-orfao',
    );
  });

  it('não deve remover imagem órfã quando ela estiver vinculada a um produto', async () => {
    prisma.produto.findFirst.mockResolvedValue({
      id: 10,
    });

    await service.cleanupOrphanImage('mel-api/produtos/imagem-em-uso');

    expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();
  });

  it('não deve remover imagem se falhar ao verificar o vínculo com produtos', async () => {
    const loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    prisma.produto.findFirst.mockRejectedValue(
      new Error('Falha ao consultar banco.'),
    );

    await service.cleanupOrphanImage('mel-api/produtos/imagem-duvidosa');

    expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();

    expect(loggerWarnSpy).toHaveBeenCalled();

    loggerWarnSpy.mockRestore();
  });

  it('não deve remover imagem substituída quando os publicIds forem iguais', async () => {
    await service.cleanupReplacedImage(
      'mel-api/produtos/imagem',
      'mel-api/produtos/imagem',
    );

    expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();
  });

  it('deve remover a imagem antiga quando ela for substituída', async () => {
    await service.cleanupReplacedImage(
      'mel-api/produtos/imagem-antiga',
      'mel-api/produtos/imagem-nova',
    );

    expect(cloudinaryService.deleteImage).toHaveBeenCalledTimes(1);

    expect(cloudinaryService.deleteImage).toHaveBeenCalledWith(
      'mel-api/produtos/imagem-antiga',
    );
  });

  it('não deve propagar erro quando a Cloudinary falhar ao excluir imagem', async () => {
    const loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    cloudinaryService.deleteImage.mockRejectedValue(
      new Error('Cloudinary indisponível.'),
    );

    await expect(
      service.cleanupImage('mel-api/produtos/imagem'),
    ).resolves.toBeUndefined();

    expect(loggerWarnSpy).toHaveBeenCalled();

    loggerWarnSpy.mockRestore();
  });
});
