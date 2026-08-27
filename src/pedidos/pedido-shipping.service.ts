import { BadRequestException, Injectable } from '@nestjs/common';

import { FreteService } from '../frete/frete.service';
import type { CreatePedidoDto } from './dto/create-pedido.dto';

interface ClienteShippingData {
  zipCode: string | null;
  street: string | null;
  addressNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
}

@Injectable()
export class PedidoShippingService {
  constructor(private readonly freteService: FreteService) {}

  async prepararFrete(cliente: ClienteShippingData, dto: CreatePedidoDto) {
    this.validateAddress(cliente);

    const shippingOptions = await this.freteService.calcularFrete({
      destinationZipCode: cliente.zipCode!,
      items: dto.items.map((item) => ({
        productId: item.produtoId,
        quantity: item.quantity,
      })),
    });

    const selectedOption = shippingOptions.find(
      (option) => option.serviceId === dto.shippingServiceId,
    );

    if (!selectedOption) {
      throw new BadRequestException(
        'A opção de frete selecionada não está mais disponível. Calcule o frete novamente.',
      );
    }

    return {
      shippingPrice: selectedOption.price,

      shippingServiceId: selectedOption.serviceId,

      shippingServiceName: selectedOption.serviceName,

      shippingCompanyName: selectedOption.companyName,

      shippingDeliveryTime: selectedOption.deliveryTime,

      shippingZipCode: this.normalizeZipCode(cliente.zipCode!),

      shippingStreet: cliente.street!,

      shippingAddressNumber: cliente.addressNumber!,

      shippingComplement: cliente.complement,

      shippingNeighborhood: cliente.neighborhood!,

      shippingCity: cliente.city!,

      shippingState: cliente.state!,
    };
  }

  private validateAddress(cliente: ClienteShippingData) {
    if (
      !cliente.zipCode?.trim() ||
      !cliente.street?.trim() ||
      !cliente.addressNumber?.trim() ||
      !cliente.neighborhood?.trim() ||
      !cliente.city?.trim() ||
      !cliente.state?.trim()
    ) {
      throw new BadRequestException(
        'Preencha seu endereço completo antes de finalizar o pedido.',
      );
    }
  }

  private normalizeZipCode(zipCode: string) {
    return zipCode.replace(/\D/g, '');
  }
}
