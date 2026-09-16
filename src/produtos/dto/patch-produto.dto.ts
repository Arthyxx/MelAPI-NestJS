import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class PatchProdutoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt({
    message: 'O estoque original deve ser um número inteiro.',
  })
  @Min(0, {
    message: 'O estoque original não pode ser negativo.',
  })
  expectedStockQuantity?: number;

  @IsOptional()
  @IsString()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  imagePublicId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    {
      message: 'O peso deve ser um número com no máximo 3 casas decimais.',
    },
  )
  @IsPositive({
    message: 'O peso deve ser maior que zero.',
  })
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message: 'A altura deve ser um número com no máximo 2 casas decimais.',
    },
  )
  @IsPositive({
    message: 'A altura deve ser maior que zero.',
  })
  heightCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message: 'A largura deve ser um número com no máximo 2 casas decimais.',
    },
  )
  @IsPositive({
    message: 'A largura deve ser maior que zero.',
  })
  widthCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'O comprimento deve ser um número com no máximo 2 casas decimais.',
    },
  )
  @IsPositive({
    message: 'O comprimento deve ser maior que zero.',
  })
  lengthCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
