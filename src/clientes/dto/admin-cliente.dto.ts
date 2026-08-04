import { PartialType } from '@nestjs/mapped-types';
import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { CreateClienteDto } from './create-cliente.dto';

export class CreateAdminClienteDto extends CreateClienteDto {
  @IsOptional()
  @IsEnum(Role, {
    message: 'A função deve ser ADMIN ou CLIENTE.',
  })
  role?: Role;

  @IsOptional()
  @IsBoolean({
    message: 'O campo ativo deve ser verdadeiro ou falso.',
  })
  active?: boolean;
}

export class UpdateAdminClienteDto extends PartialType(
  CreateAdminClienteDto,
) {}