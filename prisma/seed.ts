import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { hashPassword, randomPasswordHumanFriendly } from "../lib/password";

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

const USERS: { name: string; loginId: string; role: "member" | "manager" }[] = [
  // ニナウ（経営層・管理職）
  { name: "髙山 澄人", loginId: "takayama", role: "manager" },
  { name: "保志 光秀", loginId: "hoshi", role: "manager" },
  { name: "武藤 飛翔", loginId: "mutoh", role: "manager" },
  { name: "本郷 拓也", loginId: "hongo", role: "manager" },
  { name: "渡辺 翼", loginId: "watanabe_tsubasa", role: "manager" },
  { name: "比佐 京太", loginId: "hisa", role: "manager" },
  // ニナウ（社員）
  { name: "澤野 大和", loginId: "sawano", role: "member" },
  { name: "原田 良輔", loginId: "harada", role: "member" },
  { name: "藤巻 卓優", loginId: "fujimaki", role: "member" },
  { name: "渡邉 史仁", loginId: "watanabe_fumihito", role: "member" },
  // 蛸と衣
  { name: "沼倉 友香", loginId: "numakura", role: "member" },
  { name: "森下 加奈", loginId: "morishita_kana", role: "member" },
  { name: "岡本 みち子", loginId: "okamoto", role: "member" },
  { name: "森下 陽奈", loginId: "morishita_hina", role: "member" },
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
  const credentials: { name: string; loginId: string; password: string }[] = [];
  const now = new Date();

  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { loginId: u.loginId } });
    if (existing?.passwordHash) {
      // 既にパスワードが発行されている場合は role/name のみ更新（パスワード保持）
      await prisma.user.update({
        where: { loginId: u.loginId },
        data: { name: u.name, role: u.role, isActive: true },
      });
      continue;
    }

    const password = randomPasswordHumanFriendly();
    const passwordHash = hashPassword(password);

    if (existing) {
      await prisma.user.update({
        where: { loginId: u.loginId },
        data: {
          name: u.name,
          role: u.role,
          passwordHash,
          passwordUpdatedAt: now,
          isActive: true,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          name: u.name,
          role: u.role,
          loginId: u.loginId,
          passwordHash,
          passwordUpdatedAt: now,
          isActive: true,
        },
      });
    }
    credentials.push({ name: u.name, loginId: u.loginId, password });
  }

  for (const name of WORK_SITES) {
    await prisma.workSite.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const setting of APP_SETTINGS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }

  console.log(`Seeded ${USERS.length} users / ${WORK_SITES.length} work sites / ${APP_SETTINGS.length} settings`);

  if (credentials.length > 0) {
    console.log("\n=== 初期パスワード（紙にコピーして配布、画面では再表示できません） ===");
    console.log(`${"name".padEnd(14)}  ${"loginId".padEnd(20)}  password`);
    for (const c of credentials) {
      console.log(`${c.name.padEnd(14)}  ${c.loginId.padEnd(20)}  ${c.password}`);
    }
    console.log("=== ここまで ===\n");
  } else {
    console.log("(既存ユーザーのみ、パスワードは保持されました)");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
