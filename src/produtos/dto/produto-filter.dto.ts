import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ProdutoFilterDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return value;
  })
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @IsIn([
    'price,asc',
    'price,desc',
    'name,asc',
    'name,desc',
    'id,asc',
    'id,desc',
  ])
  sort?: string;

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
    message: 'O limite máximo é de 100 produtos.',
  })
  limit: number = 10;
}
