import { Body, Controller, Post } from '@nestjs/common';

import { CalcularFreteDto } from './dto/calcular-frete.dto';
import { FreteService } from './frete.service';

@Controller('frete')
export class FreteController {
  constructor(private readonly freteService: FreteService) {}

  @Post('calcular')
  calcularFrete(@Body() dto: CalcularFreteDto) {
    return this.freteService.calcularFrete(dto);
  }
}
