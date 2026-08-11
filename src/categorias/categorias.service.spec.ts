import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriasService } from './categorias.service';

describe('CategoriasService', () => {
  let service: CategoriasService;

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          CategoriasService,
          {
            provide: PrismaService,
            useValue: {},
          },
        ],
      }).compile();

    service =
      module.get<CategoriasService>(
        CategoriasService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});