import { Test } from '@nestjs/testing';

import { CalcularFreteDto } from './dto/calcular-frete.dto';
import { FreteController } from './frete.controller';
import { FreteService } from './frete.service';

describe('FreteController', () => {
  const freteService = {
    calcularFrete: jest.fn(),
  };

  let controller: FreteController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [FreteController],
      providers: [
        {
          provide: FreteService,
          useValue: freteService,
        },
      ],
    }).compile();

    controller = moduleRef.get<FreteController>(FreteController);
  });

  it('deve encaminhar os dados para o serviço de frete', async () => {
    const dto: CalcularFreteDto = {
      destinationZipCode: '60000-000',
      items: [
        {
          productId: 1,
          quantity: 2,
        },
      ],
    };

    const cotacoes = [
      {
        id: 1,
        name: 'PAC',
        price: '25.90',
      },
    ];

    freteService.calcularFrete.mockResolvedValue(cotacoes);

    const result = await controller.calcularFrete(dto);

    expect(freteService.calcularFrete).toHaveBeenCalledWith(dto);

    expect(result).toEqual(cotacoes);
  });
});
