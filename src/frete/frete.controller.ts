import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CalcularFreteDto } from './dto/calcular-frete.dto';
import { FreteService } from './frete.service';

@Controller('frete')
export class FreteController {
  constructor(private readonly freteService: FreteService) {}

  @Throttle({
    default: {
      limit: 20,
      ttl: 60_000,
    },
  })
  @Post('calcular')
  calcularFrete(@Body() dto: CalcularFreteDto) {
    return this.freteService.calcularFrete(dto);
  }
}
