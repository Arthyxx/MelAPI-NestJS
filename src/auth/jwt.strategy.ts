import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
  tokenVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET não foi definido no .env');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub || !Number.isInteger(payload.sub)) {
      throw new UnauthorizedException('Token inválido.');
    }

    if (!Number.isInteger(payload.tokenVersion) || payload.tokenVersion < 0) {
      throw new UnauthorizedException('Token inválido.');
    }

    const cliente = await this.prisma.cliente.findUnique({
      where: {
        id: payload.sub,
      },

      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        tokenVersion: true,
      },
    });

    if (!cliente) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    if (!cliente.active) {
      throw new UnauthorizedException('Esta conta está desativada.');
    }

    if (cliente.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException(
        'Sua sessão não é mais válida. Faça login novamente.',
      );
    }

    return {
      sub: cliente.id,
      email: cliente.email,
      role: cliente.role,
    };
  }
}
