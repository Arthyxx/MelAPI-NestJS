import { ProdutosService } from './produtos.service';
import { ProdutoMutationService } from './services/produto-mutation.service';
import { ProdutoQueryService } from './services/produto-query.service';

describe('ProdutosService', () => {
  let service: ProdutosService;

  const produtoQueryService = {
    findAllPublic: jest.fn(),
    findAllAdmin: jest.fn(),
    findByIdPublic: jest.fn(),
    findByIdAdmin: jest.fn(),
  };

  const produtoMutationService = {
    create: jest.fn(),
    update: jest.fn(),
    partialUpdate: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ProdutosService(
      produtoQueryService as unknown as ProdutoQueryService,
      produtoMutationService as unknown as ProdutoMutationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve delegar consultas para ProdutoQueryService', async () => {
    const filter = {
      page: 1,
      limit: 10,
    };

    produtoQueryService.findAllPublic.mockResolvedValue([]);
    produtoQueryService.findAllAdmin.mockResolvedValue({
      content: [],
      pagination: {
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    produtoQueryService.findByIdPublic.mockResolvedValue({ id: 10 });
    produtoQueryService.findByIdAdmin.mockResolvedValue({ id: 10 });

    await service.findAllPublic(filter);
    await service.findAllAdmin(filter);
    await service.findByIdPublic(10);
    await service.findByIdAdmin(10);

    expect(produtoQueryService.findAllPublic).toHaveBeenCalledWith(filter);
    expect(produtoQueryService.findAllAdmin).toHaveBeenCalledWith(filter);
    expect(produtoQueryService.findByIdPublic).toHaveBeenCalledWith(10);
    expect(produtoQueryService.findByIdAdmin).toHaveBeenCalledWith(10);
  });

  it('deve delegar mutações para ProdutoMutationService', async () => {
    const createDto = {
      name: 'Mel Teste',
      price: 35,
      stockQuantity: 10,
      categoryId: 1,
      active: true,
    };

    const updateDto = {
      name: 'Mel Atualizado',
      price: 40,
      stockQuantity: 15,
      expectedStockQuantity: 10,
      categoryId: 1,
      active: true,
    };

    const patchDto = {
      description: 'Nova descrição',
    };

    produtoMutationService.create.mockResolvedValue({ id: 10 });
    produtoMutationService.update.mockResolvedValue({ id: 10 });
    produtoMutationService.partialUpdate.mockResolvedValue({ id: 10 });
    produtoMutationService.delete.mockResolvedValue(undefined);

    await service.create(createDto);
    await service.update(10, updateDto);
    await service.partialUpdate(10, patchDto);
    await service.delete(10);

    expect(produtoMutationService.create).toHaveBeenCalledWith(createDto);
    expect(produtoMutationService.update).toHaveBeenCalledWith(10, updateDto);
    expect(produtoMutationService.partialUpdate).toHaveBeenCalledWith(
      10,
      patchDto,
    );
    expect(produtoMutationService.delete).toHaveBeenCalledWith(10);
  });
});
