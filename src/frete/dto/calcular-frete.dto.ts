import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class FreteItemDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId!: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity!: number;
}

export class CalcularFreteDto {
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, {
    message: 'O CEP de destino deve possuir 8 números.',
  })
  destinationZipCode!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FreteItemDto)
  items!: FreteItemDto[];
}
