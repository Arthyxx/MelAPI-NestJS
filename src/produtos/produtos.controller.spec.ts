import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';

describe('ProdutosController', () => {
  let controller: ProdutosController;

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [
          ProdutosController,
        ],
        providers: [
          {
            provide: ProdutosService,
            useValue: {},
          },
        ],
      }).compile();

    controller =
      module.get<ProdutosController>(
        ProdutosController,
      );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});