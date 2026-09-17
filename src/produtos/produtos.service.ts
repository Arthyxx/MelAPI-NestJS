import { Injectable } from '@nestjs/common';

import { CreateProdutoDto } from './dto/create-produto.dto';
import { PatchProdutoDto } from './dto/patch-produto.dto';
import { ProdutoFilterDto } from './dto/produto-filter.dto';
import { PutProdutoDto } from './dto/put-produto.dto';
import { ProdutoMutationService } from './services/produto-mutation.service';
import { ProdutoQueryService } from './services/produto-query.service';

@Injectable()
export class ProdutosService {
  constructor(
    private readonly produtoQueryService: ProdutoQueryService,
    private readonly produtoMutationService: ProdutoMutationService,
  ) {}

  findAllPublic(filter: ProdutoFilterDto) {
    return this.produtoQueryService.findAllPublic(filter);
  }

  findAllAdmin(filter: ProdutoFilterDto) {
    return this.produtoQueryService.findAllAdmin(filter);
  }

  findByIdPublic(id: number) {
    return this.produtoQueryService.findByIdPublic(id);
  }

  findByIdAdmin(id: number) {
    return this.produtoQueryService.findByIdAdmin(id);
  }

  create(dto: CreateProdutoDto) {
    return this.produtoMutationService.create(dto);
  }

  update(id: number, dto: PutProdutoDto) {
    return this.produtoMutationService.update(id, dto);
  }

  partialUpdate(id: number, dto: PatchProdutoDto) {
    return this.produtoMutationService.partialUpdate(id, dto);
  }

  delete(id: number) {
    return this.produtoMutationService.delete(id);
  }
}
