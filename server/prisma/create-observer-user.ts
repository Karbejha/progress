import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('observer123', 10);

  const observerUser = await prisma.user.upsert({
    where: { username: 'observer' },
    update: {
      fullName: 'مراقب مركزي',
      title: 'مراقب',
      email: 'observer@ports.gov.sy',
      password: hashedPassword,
      role: Role.OBSERVER,
      directorateId: null,
    },
    create: {
      username: 'observer',
      email: 'observer@ports.gov.sy',
      password: hashedPassword,
      fullName: 'مراقب مركزي',
      title: 'مراقب',
      role: Role.OBSERVER,
      directorateId: null,
    },
  });

  console.log('✅ Observer account created/updated successfully:');
  console.log({
    id: observerUser.id,
    username: observerUser.username,
    fullName: observerUser.fullName,
    title: observerUser.title,
    role: observerUser.role,
    email: observerUser.email,
  });
}

main()
  .catch((e) => {
    console.error('❌ Failed to upsert observer user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
