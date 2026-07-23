import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClienteDto {
  @ApiProperty({ example: 'João da Silva', description: 'Nome do cliente' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'joao@email.com', description: 'E-mail do cliente' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456', description: 'Senha do cliente' })
  @IsString()
  @MinLength(6)
  password!: string;
}