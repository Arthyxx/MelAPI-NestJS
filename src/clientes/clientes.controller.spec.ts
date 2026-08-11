import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

describe('ClientesController', () => {
  let controller: ClientesController;

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [
          ClientesController,
        ],
        providers: [
          {
            provide: ClientesService,
            useValue: {},
          },
        ],
      }).compile();

    controller =
      module.get<ClientesController>(
        ClientesController,
      );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});