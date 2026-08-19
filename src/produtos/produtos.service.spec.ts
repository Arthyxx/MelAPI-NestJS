import { ConflictException, Logger, NotFoundException } from '@nestjs/common';

import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProdutoFilterDto } from './dto/produto-filter.dto';
import { ProdutosService } from './produtos.service';

describe('ProdutosService', () => {
  let service: ProdutosService;

  let prisma: {
    produto: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    categoria: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  let cloudinaryService: {
    deleteImage: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      produto: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },

      categoria: {
        findUnique: jest.fn(),
      },

      $transaction: jest.fn(),
    };

    cloudinaryService = {
      deleteImage: jest.fn(),
    };

    service = new ProdutosService(
      prisma as unknown as PrismaService,
      cloudinaryService as unknown as CloudinaryService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve impedir criação de produto em categoria inativa', async () => {
    prisma.produto.findFirst.mockResolvedValue(null);

    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
      active: false,
    });

    const dto = {
      name: 'Mel Teste',
      price: 35,
      stockQuantity: 10,
      categoryId: 1,
      active: true,
    };

    await expect(service.create(dto)).rejects.toThrow(
      new ConflictException(
        'Não é possível vincular produto a uma categoria inativa.',
      ),
    );

    expect(prisma.produto.create).not.toHaveBeenCalled();
  });

  it('deve remover imagem órfã quando a criação do produto falhar', async () => {
    prisma.produto.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
      active: false,
    });

    cloudinaryService.deleteImage.mockResolvedValue(undefined);

    const dto = {
      name: 'Mel com Imagem',
      price: 35,
      stockQuantity: 10,
      categoryId: 1,
      active: true,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/mel.jpg',
      imagePublicId: 'mel-api/produtos/upload-orfao',
    };

    await expect(service.create(dto)).rejects.toThrow(
      new ConflictException(
        'Não é possível vincular produto a uma categoria inativa.',
      ),
    );

    expect(prisma.produto.findFirst).toHaveBeenLastCalledWith({
      where: {
        imagePublicId: 'mel-api/produtos/upload-orfao',
      },
      select: {
        id: true,
      },
    });

    expect(cloudinaryService.deleteImage).toHaveBeenCalledTimes(1);

    expect(cloudinaryService.deleteImage).toHaveBeenCalledWith(
      'mel-api/produtos/upload-orfao',
    );
  });

  it('não deve remover imagem quando ela já estiver vinculada a um produto', async () => {
    prisma.produto.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 20,
    });

    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
      active: false,
    });

    const dto = {
      name: 'Mel Teste',
      price: 35,
      stockQuantity: 10,
      categoryId: 1,
      active: true,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/mel.jpg',
      imagePublicId: 'mel-api/produtos/imagem-em-uso',
    };

    await expect(service.create(dto)).rejects.toThrow(
      new ConflictException(
        'Não é possível vincular produto a uma categoria inativa.',
      ),
    );

    expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();
  });

  it('deve remover nova imagem órfã quando a atualização do produto falhar', async () => {
    prisma.produto.findUnique.mockResolvedValue({
      id: 10,
      imagePublicId: 'mel-api/produtos/imagem-antiga',
    });

    prisma.produto.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
      active: true,
    });

    prisma.produto.update.mockRejectedValue(
      new Error('Falha ao atualizar produto.'),
    );

    cloudinaryService.deleteImage.mockResolvedValue(undefined);

    const dto = {
      name: 'Mel Atualizado',
      description: 'Descrição',
      price: 40,
      stockQuantity: 15,
      categoryId: 1,
      active: true,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/nova.jpg',
      imagePublicId: 'mel-api/produtos/imagem-nova',
    };

    await expect(service.update(10, dto)).rejects.toThrow(
      'Falha ao atualizar produto.',
    );

    expect(cloudinaryService.deleteImage).toHaveBeenCalledTimes(1);

    expect(cloudinaryService.deleteImage).toHaveBeenCalledWith(
      'mel-api/produtos/imagem-nova',
    );

    expect(cloudinaryService.deleteImage).not.toHaveBeenCalledWith(
      'mel-api/produtos/imagem-antiga',
    );
  });

  it('não deve apagar imagem se não conseguir verificar se ela está vinculada', async () => {
    const loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    prisma.produto.findFirst
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('Falha ao consultar vínculo.'));

    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
      active: false,
    });

    const dto = {
      name: 'Mel Teste',
      price: 35,
      stockQuantity: 10,
      categoryId: 1,
      active: true,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/mel.jpg',
      imagePublicId: 'mel-api/produtos/imagem-duvidosa',
    };

    await expect(service.create(dto)).rejects.toThrow(
      new ConflictException(
        'Não é possível vincular produto a uma categoria inativa.',
      ),
    );

    expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();

    expect(loggerWarnSpy).toHaveBeenCalled();

    loggerWarnSpy.mockRestore();
  });

  it('deve impedir alteração para uma categoria inativa', async () => {
    prisma.produto.findUnique.mockResolvedValue({
      id: 10,
      imagePublicId: null,
    });

    prisma.categoria.findUnique.mockResolvedValue({
      id: 2,
      active: false,
    });

    await expect(
      service.partialUpdate(10, {
        categoryId: 2,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'Não é possível vincular produto a uma categoria inativa.',
      ),
    );

    expect(prisma.produto.update).not.toHaveBeenCalled();
  });

  it('deve desativar produto com histórico de pedidos em vez de excluir', async () => {
    prisma.produto.findUnique.mockResolvedValue({
      id: 10,
      imagePublicId: 'mel-api/produtos/imagem-antiga',
      _count: {
        pedidoItems: 3,
      },
    });

    prisma.produto.update.mockResolvedValue({
      id: 10,
      active: false,
    });

    await service.delete(10);

    expect(prisma.produto.update).toHaveBeenCalledTimes(1);

    expect(prisma.produto.update).toHaveBeenCalledWith({
      where: {
        id: 10,
      },
      data: {
        active: false,
      },
    });

    expect(prisma.produto.delete).not.toHaveBeenCalled();

    expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();
  });

  it('deve excluir definitivamente produto sem histórico de pedidos', async () => {
    prisma.produto.findUnique.mockResolvedValue({
      id: 10,
      imagePublicId: null,
      _count: {
        pedidoItems: 0,
      },
    });

    prisma.produto.delete.mockResolvedValue({
      id: 10,
    });

    await service.delete(10);

    expect(prisma.produto.delete).toHaveBeenCalledTimes(1);

    expect(prisma.produto.delete).toHaveBeenCalledWith({
      where: {
        id: 10,
      },
    });

    expect(prisma.produto.update).not.toHaveBeenCalled();
  });

  it('deve remover imagem da Cloudinary ao excluir definitivamente um produto', async () => {
    prisma.produto.findUnique.mockResolvedValue({
      id: 10,
      imagePublicId: 'mel-api/produtos/mel-teste',
      _count: {
        pedidoItems: 0,
      },
    });

    prisma.produto.delete.mockResolvedValue({
      id: 10,
    });

    cloudinaryService.deleteImage.mockResolvedValue(undefined);

    await service.delete(10);

    expect(cloudinaryService.deleteImage).toHaveBeenCalledTimes(1);

    expect(cloudinaryService.deleteImage).toHaveBeenCalledWith(
      'mel-api/produtos/mel-teste',
    );
  });

  it('deve rejeitar exclusão de produto inexistente', async () => {
    prisma.produto.findUnique.mockResolvedValue(null);

    await expect(service.delete(999)).rejects.toThrow(
      new NotFoundException('Produto não encontrado.'),
    );

    expect(prisma.produto.delete).not.toHaveBeenCalled();

    expect(prisma.produto.update).not.toHaveBeenCalled();

    expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();
  });

  it('deve listar publicamente apenas produtos ativos de categorias ativas', async () => {
    prisma.produto.findMany.mockResolvedValue([]);

    const filter = {} as ProdutoFilterDto;

    const result = await service.findAllPublic(filter);

    expect(result).toEqual([]);

    expect(prisma.produto.findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        category: {
          active: true,
        },
      },
      orderBy: {
        id: 'asc',
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        avaliacoes: {
          select: {
            rating: true,
          },
        },
      },
    });
  });
});
