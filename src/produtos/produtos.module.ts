import { Module } from '@nestjs/common';

import { ProdutoImageService } from './produto-image.service';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';
import { ProdutoMutationService } from './services/produto-mutation.service';
import { ProdutoQueryService } from './services/produto-query.service';

@Module({
  controllers: [ProdutosController],
  providers: [
    ProdutosService,
    ProdutoImageService,
    ProdutoQueryService,
    ProdutoMutationService,
  ],
})
export class ProdutosModule {}
