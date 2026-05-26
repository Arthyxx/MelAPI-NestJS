import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminName = process.env.ADMIN_NAME || 'Administrador';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@email.com';
  const adminPassword = process.env.ADMIN_PASSWORD || '123456';

  const normalizedEmail = adminEmail.trim().toLowerCase();

  const existingAdmin = await prisma.cliente.findUnique({
    where: {
      email: normalizedEmail,
    },
  });

  if (existingAdmin) {
    console.log(`Admin já existe: ${normalizedEmail}`);

    if (existingAdmin.role !== Role.ADMIN) {
      await prisma.cliente.update({
        where: {
          id: existingAdmin.id,
        },
        data: {
          role: Role.ADMIN,
        },
      });

      console.log(`Usuário ${normalizedEmail} atualizado para ADMIN.`);
    }

    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await prisma.cliente.create({
    data: {
      name: adminName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: Role.ADMIN,
    },
  });

  console.log(`Admin criado com sucesso: ${normalizedEmail}`);
}

main()
  .catch((error) => {
    console.error('Erro ao executar seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });