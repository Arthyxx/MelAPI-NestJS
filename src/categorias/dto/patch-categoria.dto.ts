import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchCategoriaDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}