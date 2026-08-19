import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StatusPedido } from '@prisma/client';

export class PedidoFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'A página deve ser um número inteiro.',
  })
  @Min(1, {
    message: 'A página deve ser maior ou igual a 1.',
  })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'O limite deve ser um número inteiro.',
  })
  @Min(1, {
    message: 'O limite deve ser maior ou igual a 1.',
  })
  @Max(100, {
    message: 'O limite máximo é de 100 pedidos.',
  })
  limit: number = 10;

  @IsOptional()
  @IsString({
    message: 'A busca deve ser um texto.',
  })
  @MaxLength(160, {
    message: 'A busca deve ter no máximo 160 caracteres.',
  })
  search?: string;

  @IsOptional()
  @IsEnum(StatusPedido, {
    message: 'Status de pedido inválido.',
  })
  status?: StatusPedido;
}
