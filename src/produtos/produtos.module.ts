import { Module } from '@nestjs/common';

import { ProdutoImageService } from './produto-image.service';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';

@Module({
  controllers: [ProdutosController],
  providers: [ProdutosService, ProdutoImageService],
})
export class ProdutosModule {}
