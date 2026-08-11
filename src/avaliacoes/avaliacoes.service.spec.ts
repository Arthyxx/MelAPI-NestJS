import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AvaliacoesService } from './avaliacoes.service';

describe('AvaliacoesService', () => {
  let service: AvaliacoesService;

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          AvaliacoesService,
          {
            provide: PrismaService,
            useValue: {},
          },
        ],
      }).compile();

    service =
      module.get<AvaliacoesService>(
        AvaliacoesService,
      );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});