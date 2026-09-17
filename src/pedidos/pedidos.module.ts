import { Module } from '@nestjs/common';

import { FreteModule } from '../frete/frete.module';
import { PedidoShippingService } from './pedido-shipping.service';
import { PedidosController } from './pedidos.controller';
import { PedidosExpirationService } from './pedidos-expiration.service';
import { PedidosService } from './pedidos.service';
import { PedidoCreationService } from './services/pedido-creation.service';
import { PedidoLifecycleService } from './services/pedido-lifecycle.service';
import { PedidoQueryService } from './services/pedido-query.service';

@Module({
  imports: [FreteModule],
  controllers: [PedidosController],
  providers: [
    PedidosService,
    PedidoShippingService,
    PedidoQueryService,
    PedidoCreationService,
    PedidoLifecycleService,
    PedidosExpirationService,
  ],
  exports: [PedidosService],
})
export class PedidosModule {}
