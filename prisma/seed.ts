import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = ["田中 太郎", "佐藤 花子", "鈴木 次郎", "高橋 美咲", "渡辺 健一"];
  for (const name of users) {
    await prisma.user.upsert({
      where: { id: name },
      update: {},
      create: { id: name, name },
    });
  }
  console.log(`Seeded ${users.length} users`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
