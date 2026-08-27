import { BadRequestException } from '@nestjs/common';

import { FreteService } from '../frete/frete.service';
import { PedidoShippingService } from './pedido-shipping.service';

describe('PedidoShippingService', () => {
  const freteService = {
    calcularFrete: jest.fn(),
  };

  let service: PedidoShippingService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new PedidoShippingService(
      freteService as unknown as FreteService,
    );
  });

  it('deve recalcular o frete e preparar os dados para o pedido', async () => {
    freteService.calcularFrete.mockResolvedValue([
      {
        serviceId: '1',
        serviceName: 'PAC',
        companyName: 'Correios',
        companyPicture: undefined,
        price: 25.9,
        deliveryTime: 6,
      },
      {
        serviceId: '2',
        serviceName: 'SEDEX',
        companyName: 'Correios',
        companyPicture: undefined,
        price: 42.5,
        deliveryTime: 3,
      },
    ]);

    const result = await service.prepararFrete(
      {
        zipCode: '62300-000',
        street: 'Rua Principal',
        addressNumber: '123',
        complement: 'Casa',
        neighborhood: 'Centro',
        city: 'Viçosa do Ceará',
        state: 'CE',
      },
      {
        items: [
          {
            produtoId: 10,
            quantity: 2,
          },
        ],
        shippingServiceId: '1',
      },
    );

    expect(freteService.calcularFrete).toHaveBeenCalledWith({
      destinationZipCode: '62300-000',
      items: [
        {
          productId: 10,
          quantity: 2,
        },
      ],
    });

    expect(result).toEqual({
      shippingPrice: 25.9,
      shippingServiceId: '1',
      shippingServiceName: 'PAC',
      shippingCompanyName: 'Correios',
      shippingDeliveryTime: 6,

      shippingZipCode: '62300000',
      shippingStreet: 'Rua Principal',
      shippingAddressNumber: '123',
      shippingComplement: 'Casa',
      shippingNeighborhood: 'Centro',
      shippingCity: 'Viçosa do Ceará',
      shippingState: 'CE',
    });
  });

  it('deve rejeitar cliente sem endereço completo', async () => {
    await expect(
      service.prepararFrete(
        {
          zipCode: '62300-000',
          street: 'Rua Principal',
          addressNumber: null,
          complement: null,
          neighborhood: 'Centro',
          city: 'Viçosa do Ceará',
          state: 'CE',
        },
        {
          items: [
            {
              produtoId: 10,
              quantity: 1,
            },
          ],
          shippingServiceId: '1',
        },
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Preencha seu endereço completo antes de finalizar o pedido.',
      ),
    );

    expect(freteService.calcularFrete).not.toHaveBeenCalled();
  });

  it('deve rejeitar modalidade que não estiver mais disponível', async () => {
    freteService.calcularFrete.mockResolvedValue([
      {
        serviceId: '2',
        serviceName: 'SEDEX',
        companyName: 'Correios',
        companyPicture: undefined,
        price: 42.5,
        deliveryTime: 3,
      },
    ]);

    await expect(
      service.prepararFrete(
        {
          zipCode: '62300-000',
          street: 'Rua Principal',
          addressNumber: '123',
          complement: null,
          neighborhood: 'Centro',
          city: 'Viçosa do Ceará',
          state: 'CE',
        },
        {
          items: [
            {
              produtoId: 10,
              quantity: 1,
            },
          ],
          shippingServiceId: '1',
        },
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'A opção de frete selecionada não está mais disponível. Calcule o frete novamente.',
      ),
    );
  });

  it('deve permitir endereço sem complemento', async () => {
    freteService.calcularFrete.mockResolvedValue([
      {
        serviceId: '1',
        serviceName: 'PAC',
        companyName: 'Correios',
        companyPicture: undefined,
        price: 25.9,
        deliveryTime: 6,
      },
    ]);

    const result = await service.prepararFrete(
      {
        zipCode: '60000-000',
        street: 'Rua Teste',
        addressNumber: '50',
        complement: null,
        neighborhood: 'Centro',
        city: 'Fortaleza',
        state: 'CE',
      },
      {
        items: [
          {
            produtoId: 10,
            quantity: 1,
          },
        ],
        shippingServiceId: '1',
      },
    );

    expect(result.shippingComplement).toBeNull();

    expect(result.shippingZipCode).toBe('60000000');
  });
});
