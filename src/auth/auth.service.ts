import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthService } from './google-auth.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const cliente = await this.prisma.cliente.findUnique({
      where: {
        email,
      },
    });

    if (!cliente || !cliente.active || !cliente.password) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      cliente.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    return this.createAuthResponse(cliente);
  }

  async loginGoogle(dto: GoogleLoginDto) {
    const googleIdentity = await this.googleAuthService.verifyCredential(
      dto.credential,
    );

    let cliente = await this.prisma.cliente.findUnique({
      where: {
        googleSub: googleIdentity.sub,
      },
    });

    if (!cliente) {
      const clienteByEmail = await this.prisma.cliente.findUnique({
        where: {
          email: googleIdentity.email,
        },
      });

      if (clienteByEmail) {
        if (!clienteByEmail.active) {
          throw new UnauthorizedException('Esta conta está desativada.');
        }

        if (
          clienteByEmail.googleSub &&
          clienteByEmail.googleSub !== googleIdentity.sub
        ) {
          throw new UnauthorizedException(
            'Este e-mail já está vinculado a outra conta Google.',
          );
        }

        cliente = await this.prisma.cliente.update({
          where: {
            id: clienteByEmail.id,
          },
          data: {
            googleSub: googleIdentity.sub,
          },
        });
      } else {
        cliente = await this.prisma.cliente.create({
          data: {
            name: googleIdentity.name,
            email: googleIdentity.email,
            password: null,
            googleSub: googleIdentity.sub,
            role: Role.CLIENTE,
            active: true,
          },
        });
      }
    }

    if (!cliente.active) {
      throw new UnauthorizedException('Esta conta está desativada.');
    }

    return this.createAuthResponse(cliente);
  }

  private async createAuthResponse(cliente: {
    id: number;
    name: string;
    email: string;
    role: Role;
    active: boolean;
  }) {
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
        active: cliente.active,
      },
    };
  }
}
