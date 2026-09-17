import { Module } from '@nestjs/common';

import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { ClienteAccountService } from './services/cliente-account.service';
import { ClienteAdminService } from './services/cliente-admin.service';
import { ClienteQueryService } from './services/cliente-query.service';

@Module({
  controllers: [ClientesController],
  providers: [
    ClientesService,
    ClienteQueryService,
    ClienteAccountService,
    ClienteAdminService,
  ],
})
export class ClientesModule {}
