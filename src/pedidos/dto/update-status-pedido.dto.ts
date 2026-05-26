import { StatusPedido } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateStatusPedidoDto {
  @IsEnum(StatusPedido)
  status!: StatusPedido;
}