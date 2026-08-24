import { ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ProdutoFilterDto } from './dto/produto-filter.dto';
import { ProdutoImageService } from './produto-image.service';
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

  let produtoImageService: {
    cleanupOrphanImage: jest.Mock;
    cleanupReplacedImage: jest.Mock;
    cleanupImage: jest.Mock;
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

    produtoImageService = {
      cleanupOrphanImage: jest.fn().mockResolvedValue(undefined),

      cleanupReplacedImage: jest.fn().mockResolvedValue(undefined),

      cleanupImage: jest.fn().mockResolvedValue(undefined),
    };

    service = new ProdutosService(
      prisma as unknown as PrismaService,
      produtoImageService as unknown as ProdutoImageService,
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

    expect(produtoImageService.cleanupOrphanImage).toHaveBeenCalledWith(null);
  });

  it('deve solicitar limpeza da imagem órfã quando a criação falhar', async () => {
    prisma.produto.findFirst.mockResolvedValue(null);

    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
      active: false,
    });

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

    expect(produtoImageService.cleanupOrphanImage).toHaveBeenCalledTimes(1);

    expect(produtoImageService.cleanupOrphanImage).toHaveBeenCalledWith(
      'mel-api/produtos/upload-orfao',
    );
  });

  it('deve solicitar limpeza da nova imagem quando a atualização falhar', async () => {
    prisma.produto.findUnique.mockResolvedValue({
      id: 10,
      imagePublicId: 'mel-api/produtos/imagem-antiga',
    });

    prisma.produto.findFirst.mockResolvedValue(null);

    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
      active: true,
    });

    prisma.produto.update.mockRejectedValue(
      new Error('Falha ao atualizar produto.'),
    );

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

    expect(produtoImageService.cleanupOrphanImage).toHaveBeenCalledTimes(1);

    expect(produtoImageService.cleanupOrphanImage).toHaveBeenCalledWith(
      'mel-api/produtos/imagem-nova',
    );

    expect(produtoImageService.cleanupReplacedImage).not.toHaveBeenCalled();
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

    expect(produtoImageService.cleanupOrphanImage).toHaveBeenCalledWith(null);
  });

  it('deve solicitar remoção da imagem antiga após atualização bem-sucedida', async () => {
    prisma.produto.findUnique.mockResolvedValue({
      id: 10,
      imagePublicId: 'mel-api/produtos/imagem-antiga',
    });

    prisma.produto.findFirst.mockResolvedValue(null);

    prisma.categoria.findUnique.mockResolvedValue({
      id: 1,
      active: true,
    });

    const produtoAtualizado = {
      id: 10,
      name: 'Mel Atualizado',
      description: null,
      price: 40,
      stockQuantity: 10,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/nova.jpg',
      imagePublicId: 'mel-api/produtos/imagem-nova',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      categoryId: 1,
      category: {
        id: 1,
        name: 'Mel',
      },
      avaliacoes: [],
    };

    prisma.produto.update.mockResolvedValue(produtoAtualizado);

    await service.update(10, {
      name: 'Mel Atualizado',
      price: 40,
      stockQuantity: 10,
      categoryId: 1,
      active: true,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/nova.jpg',
      imagePublicId: 'mel-api/produtos/imagem-nova',
    });

    expect(produtoImageService.cleanupReplacedImage).toHaveBeenCalledWith(
      'mel-api/produtos/imagem-antiga',
      'mel-api/produtos/imagem-nova',
    );
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

    expect(produtoImageService.cleanupImage).not.toHaveBeenCalled();
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

    expect(produtoImageService.cleanupImage).toHaveBeenCalledWith(null);
  });

  it('deve solicitar remoção da imagem ao excluir definitivamente um produto', async () => {
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

    await service.delete(10);

    expect(produtoImageService.cleanupImage).toHaveBeenCalledTimes(1);

    expect(produtoImageService.cleanupImage).toHaveBeenCalledWith(
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

    expect(produtoImageService.cleanupImage).not.toHaveBeenCalled();
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
