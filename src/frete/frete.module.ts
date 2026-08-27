import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { FreteController } from './frete.controller';
import { FreteService } from './frete.service';
import { MelhorEnvioService } from './melhor-envio.service';

@Module({
  imports: [HttpModule],

  controllers: [FreteController],

  providers: [FreteService, MelhorEnvioService],

  exports: [FreteService, MelhorEnvioService],
})
export class FreteModule {}
