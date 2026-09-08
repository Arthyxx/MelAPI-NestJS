import 'dotenv/config';

import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} é obrigatório para executar o seed administrativo.`,
    );
  }

  return value;
}

async function main() {
  const adminName = process.env.ADMIN_NAME?.trim() || 'Administrador';

  const adminEmail = getRequiredEnv('ADMIN_EMAIL').toLowerCase();

  const adminPassword = getRequiredEnv('ADMIN_PASSWORD');

  if (adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD deve possuir pelo menos 12 caracteres.');
  }

  const existingCliente = await prisma.cliente.findUnique({
    where: {
      email: adminEmail,
    },

    select: {
      id: true,
      email: true,
      role: true,
      active: true,
    },
  });

  if (existingCliente) {
    if (existingCliente.role !== Role.ADMIN) {
      throw new Error(
        `Já existe um cliente com o e-mail ${adminEmail}. O seed não promoverá automaticamente esse usuário para ADMIN.`,
      );
    }

    console.log(`Administrador já existe: ${adminEmail}`);

    if (!existingCliente.active) {
      console.warn(
        `O administrador ${adminEmail} está desativado. O seed não alterará seu status automaticamente.`,
      );
    }

    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await prisma.cliente.create({
    data: {
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: Role.ADMIN,
      active: true,
    },
  });

  console.log(`Administrador criado com sucesso: ${adminEmail}`);
}

void main()
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error('Erro ao executar seed:', error.message);
    } else {
      console.error('Erro desconhecido ao executar seed.');
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
