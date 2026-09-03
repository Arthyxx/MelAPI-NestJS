import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  async verifyCredential(credential: string): Promise<GoogleIdentity> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

    if (!clientId) {
      throw new ServiceUnavailableException(
        'O login com Google ainda não está configurado.',
      );
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });

      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        throw new UnauthorizedException(
          'Não foi possível validar sua conta Google.',
        );
      }

      const email = payload.email.trim().toLowerCase();

      const name = payload.name?.trim() || email.split('@')[0] || 'Cliente';

      return {
        sub: payload.sub,
        email,
        name,
      };
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      throw new UnauthorizedException(
        'Não foi possível validar sua conta Google.',
      );
    }
  }
}
