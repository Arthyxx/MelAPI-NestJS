import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const cliente = await this.prisma.cliente.findUnique({
      where: { email },
    });

    if (!cliente) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, cliente.password);

    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const token = await this.jwtService.signAsync({
      sub: cliente.id,
      email: cliente.email,
      role: cliente.role,
    });

    return {
      token,
      user: {
        id: cliente.id,
        name: cliente.name,
        email: cliente.email,
        role: cliente.role,
      },
    };
  }
}