import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class PatchClienteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}