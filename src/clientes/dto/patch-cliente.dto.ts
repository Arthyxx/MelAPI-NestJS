import { PartialType } from '@nestjs/mapped-types';
import { CreateClienteDto } from './create-cliente.dto';

export class PatchClienteDto extends PartialType(CreateClienteDto) {}
