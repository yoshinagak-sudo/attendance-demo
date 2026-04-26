import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USERS: { name: string; role: "member" | "manager" }[] = [
  { name: "田中 太郎", role: "member" },
  { name: "佐藤 花子", role: "manager" },
  { name: "鈴木 次郎", role: "member" },
  { name: "高橋 美咲", role: "manager" },
  { name: "渡辺 健一", role: "member" },
  { name: "山本 裕子", role: "member" },
  { name: "中村 大輔", role: "member" },
];

const WORK_SITES = [
  "仙台中央ハウス",
  "若林圃場A",
  "名取育苗センター",
  "亘理レタス工場",
  "本社事務所",
];

const APP_SETTINGS: { key: string; value: string }[] = [
  { key: "regular_end_time", value: "17:30" },
];

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { id: u.name },
      update: { role: u.role },
      create: { id: u.name, name: u.name, role: u.role },
    });
  }
  console.log(`Seeded ${USERS.length} users (${USERS.filter((u) => u.role === "manager").length} managers)`);

  for (const name of WORK_SITES) {
    await prisma.workSite.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${WORK_SITES.length} work sites`);

  for (const setting of APP_SETTINGS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log(`Seeded ${APP_SETTINGS.length} app settings`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
