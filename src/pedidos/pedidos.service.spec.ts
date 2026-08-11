import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PedidosService } from './pedidos.service';

describe('PedidosService', () => {
  let service: PedidosService;

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          PedidosService,
          {
            provide: PrismaService,
            useValue: {},
          },
        ],
      }).compile();

    service =
      module.get<PedidosService>(
        PedidosService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});