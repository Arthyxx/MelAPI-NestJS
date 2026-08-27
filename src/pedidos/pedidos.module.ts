import { Module } from '@nestjs/common';

import { FreteModule } from '../frete/frete.module';
import { PedidoShippingService } from './pedido-shipping.service';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({
  imports: [FreteModule],

  controllers: [PedidosController],

  providers: [PedidosService, PedidoShippingService],
})
export class PedidosModule {}
