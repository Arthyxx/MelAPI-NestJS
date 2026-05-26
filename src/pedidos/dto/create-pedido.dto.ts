import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  ValidateNested,
  Min,
} from 'class-validator';

export class CreatePedidoItemDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  produtoId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreatePedidoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoItemDto)
  items!: CreatePedidoItemDto[];
}