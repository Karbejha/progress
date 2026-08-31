import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing director personal names from database...');

  // Update general director
  await prisma.user.updateMany({
    where: { role: Role.GENERAL_DIRECTOR },
    data: {
      fullName: 'المدير العام للموانئ',
    },
  });

  // Update assistant director
  await prisma.user.updateMany({
    where: { role: Role.ASSISTANT_DIRECTOR },
    data: {
      fullName: 'معاون المدير العام',
    },
  });

  // Update all directors of directorates: set fullName to empty string
  await prisma.user.updateMany({
    where: { role: Role.DIRECTOR },
    data: {
      fullName: '',
    },
  });

  const allUsers = await prisma.user.findMany({
    select: {
      username: true,
      fullName: true,
      title: true,
      role: true,
    },
    orderBy: { role: 'asc' },
  });

  console.log('Updated users in database:');
  console.table(allUsers);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
