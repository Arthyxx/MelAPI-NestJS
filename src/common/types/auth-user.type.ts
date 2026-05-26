import { Role } from '@prisma/client';

export interface AuthUser {
  sub: number;
  email: string;
  role: Role;
}