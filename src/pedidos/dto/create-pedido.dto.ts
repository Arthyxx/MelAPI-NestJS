import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
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

  @Type(() => Number)
  @IsNumber(
    {
      allowNaN: false,
      allowInfinity: false,
      maxDecimalPlaces: 2,
    },
    {
      message: 'O valor cotado do frete é inválido.',
    },
  )
  @Min(0, {
    message: 'O valor cotado do frete é inválido.',
  })
  quotedShippingPrice!: number;

  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, {
    message: 'O CEP usado na cotação do frete é inválido.',
  })
  quotedZipCode!: string;
}
