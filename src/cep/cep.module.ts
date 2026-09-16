import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { CepController } from './cep.controller';
import { CepService } from './cep.service';

@Module({
  imports: [HttpModule],
  controllers: [CepController],
  providers: [CepService],
})
export class CepModule {}
