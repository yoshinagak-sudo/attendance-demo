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
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  await prisma.timeRecord.deleteMany({ where: { timestamp: { gte: since } } });

  const records: { userId: string; type: string; timestamp: Date }[] = [
    // 田中 太郎（member）: 通常勤務、昼休憩あり、午後出勤中
    { userId: "田中 太郎", type: "IN", timestamp: todayAtJST(8, 5) },
    { userId: "田中 太郎", type: "OUT", timestamp: todayAtJST(12, 10) },
    { userId: "田中 太郎", type: "IN", timestamp: todayAtJST(13, 5) },

    // 佐藤 花子（manager）: 朝から出勤中、長時間連続なし
    { userId: "佐藤 花子", type: "IN", timestamp: todayAtJST(7, 55) },

    // 鈴木 次郎（member）: 早朝6:30出勤、まだ退勤せず → 長時間勤務赤バー
    { userId: "鈴木 次郎", type: "IN", timestamp: todayAtJST(6, 30) },

    // 高橋 美咲（manager）: 出勤→退勤済み
    { userId: "高橋 美咲", type: "IN", timestamp: todayAtJST(9, 20) },
    { userId: "高橋 美咲", type: "OUT", timestamp: todayAtJST(15, 30) },

    // 渡辺 健一（member）: 早朝出勤、出勤中
    { userId: "渡辺 健一", type: "IN", timestamp: todayAtJST(6, 0) },

    // 山本 裕子（member）: 出勤→退勤済み
    { userId: "山本 裕子", type: "IN", timestamp: todayAtJST(8, 30) },
    { userId: "山本 裕子", type: "OUT", timestamp: todayAtJST(16, 0) },

    // 中村 大輔（member）: 本日未出勤（残業申請デモのため空ける）
  ];

  for (const r of records) {
    await prisma.timeRecord.create({ data: r });
  }

  const userCount = await prisma.user.count();
  console.log(`Seeded ${records.length} time records for today (users: ${userCount})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
