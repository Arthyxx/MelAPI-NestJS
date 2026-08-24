import { Transform, type TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CategoriaFilterDto {
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
    message: 'O limite máximo é de 100 categorias.',
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
  @Transform(({ value }: TransformFnParams) => {
    const rawValue: unknown = value;

    if (rawValue === 'true') {
      return true;
    }

    if (rawValue === 'false') {
      return false;
    }

    return rawValue;
  })
  @IsBoolean({
    message: 'O status ativo deve ser verdadeiro ou falso.',
  })
  active?: boolean;
}
