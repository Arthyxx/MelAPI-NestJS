import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PatchClienteDto {
  @ApiProperty({ example: 'João da Silva', description: 'Nome do cliente', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'joao@email.com', description: 'E-mail do cliente', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;
  
  @ApiProperty({ example: '123456', description: 'Senha do cliente', required: false })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}