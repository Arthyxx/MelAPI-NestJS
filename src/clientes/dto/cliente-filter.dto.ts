import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Role } from '@prisma/client';

export class ClienteFilterDto {
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
    message: 'O limite máximo é de 100 clientes.',
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
  @IsEnum(Role, {
    message: 'A função deve ser ADMIN ou CLIENTE.',
  })
  role?: Role;

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
  @IsBoolean({
    message: 'O campo ativo deve ser verdadeiro ou falso.',
  })
  active?: boolean;
}
