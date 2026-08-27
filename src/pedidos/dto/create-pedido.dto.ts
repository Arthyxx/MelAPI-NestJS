import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
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

  @IsString()
  @IsNotEmpty({
    message: 'Selecione uma opção de frete.',
  })
  shippingServiceId!: string;
}
