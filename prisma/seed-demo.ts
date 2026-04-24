import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function todayAtJST(h: number, m = 0): Date {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  jstNow.setUTCHours(h, m, 0, 0);
  return new Date(jstNow.getTime() - jstOffset);
}

async function main() {
  const users = ["田中 太郎", "佐藤 花子", "鈴木 次郎", "高橋 美咲", "渡辺 健一", "山本 愛", "中村 翔"];
  for (const name of users) {
    await prisma.user.upsert({
      where: { id: name },
      update: {},
      create: { id: name, name },
    });
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  await prisma.timeRecord.deleteMany({ where: { timestamp: { gte: since } } });

  const records: { userId: string; type: string; timestamp: Date }[] = [
    { userId: "田中 太郎", type: "IN", timestamp: todayAtJST(8, 5) },
    { userId: "田中 太郎", type: "OUT", timestamp: todayAtJST(12, 10) },
    { userId: "田中 太郎", type: "IN", timestamp: todayAtJST(13, 5) },

    { userId: "佐藤 花子", type: "IN", timestamp: todayAtJST(7, 55) },

    { userId: "鈴木 次郎", type: "IN", timestamp: todayAtJST(6, 30) },
    { userId: "鈴木 次郎", type: "OUT", timestamp: todayAtJST(17, 45) },

    { userId: "高橋 美咲", type: "IN", timestamp: todayAtJST(9, 20) },

    { userId: "渡辺 健一", type: "IN", timestamp: todayAtJST(6, 0) },

    { userId: "山本 愛", type: "IN", timestamp: todayAtJST(8, 30) },
    { userId: "山本 愛", type: "OUT", timestamp: todayAtJST(16, 0) },
  ];

  for (const r of records) {
    await prisma.timeRecord.create({ data: r });
  }

  console.log(`Seeded ${users.length} users, ${records.length} records for today`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
