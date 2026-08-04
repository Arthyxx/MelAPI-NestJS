import { PartialType } from '@nestjs/mapped-types';
import { Role } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateClienteDto } from './create-cliente.dto';

export class CreateAdminClienteDto extends CreateClienteDto {
  @IsOptional()
  @IsEnum(Role, {
    message: 'A função deve ser ADMIN ou CLIENTE.',
  })
  role?: Role;
}

export class UpdateAdminClienteDto extends PartialType(
  CreateAdminClienteDto,
) {}