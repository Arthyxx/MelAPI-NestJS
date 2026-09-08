import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePedidoItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  produtoId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class CreatePedidoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoItemDto)
  items!: CreatePedidoItemDto[];

  @IsString()
  @IsNotEmpty({
    message: 'Selecione uma opção de frete.',
  })
  shippingServiceId!: string;
}
