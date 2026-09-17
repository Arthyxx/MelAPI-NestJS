import { Prisma } from '@prisma/client';

export const clienteDefaultSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  phone: true,
  street: true,
  addressNumber: true,
  complement: true,
  neighborhood: true,
  city: true,
  state: true,
  zipCode: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClienteSelect;
