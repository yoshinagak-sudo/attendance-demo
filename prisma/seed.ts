import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

function makePrisma(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (url) {
    const adapter = new PrismaLibSQL({ url, authToken });
    return new PrismaClient({ adapter });
  }
  return new PrismaClient();
}

const prisma = makePrisma();

const USERS: { name: string; role: "member" | "manager" }[] = [
  // ニナウ（経営層・管理職）
  { name: "髙山 澄人", role: "manager" },
  { name: "保志 光秀", role: "manager" },
  { name: "武藤 飛翔", role: "manager" },
  { name: "本郷 拓也", role: "manager" },
  { name: "渡辺 翼", role: "manager" },
  { name: "比佐 京太", role: "manager" },
  // ニナウ（社員）
  { name: "澤野 大和", role: "member" },
  { name: "原田 良輔", role: "member" },
  { name: "藤巻 卓優", role: "member" },
  { name: "渡邉 史仁", role: "member" },
  // 蛸と衣
  { name: "沼倉 友香", role: "member" },
  { name: "森下 加奈", role: "member" },
  { name: "岡本 みち子", role: "member" },
  { name: "森下 陽奈", role: "member" },
];

const WORK_SITES = [
  "仙台市役所 空調更新",
  "鶴巻ビル B棟 セントラル空調保守",
  "若林マンション パッケージ空調入替",
  "名取オフィス 換気設備工事",
  "本社事務所",
  "蛸と衣 店舗",
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
