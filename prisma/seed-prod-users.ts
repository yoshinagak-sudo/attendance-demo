/**
 * 本番ユーザー一括投入スクリプト（14名）
 * - email + password (password123) + name で個別ログイン可能にする
 * - 既存 User を完全リセットして再投入（参照する打刻・残業・日報・走行ログも一度全削除）
 * - role: 役職持ち6名 manager / その他8名 member
 */
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { hashPassword } from "../lib/password";

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

const DEFAULT_PASSWORD = "password123";
const EMAIL_DOMAIN = "ninau.jp";

// 役職持ち6名は manager、その他8名は member
const USERS: { name: string; email: string; role: "manager" | "member" }[] = [
  { name: "髙山 澄人", email: `takayama_sumito@${EMAIL_DOMAIN}`, role: "manager" },
  { name: "保志 光秀", email: `hoshi_mitsuhide@${EMAIL_DOMAIN}`, role: "manager" },
  { name: "武藤 飛翔", email: `muto_tsubasa@${EMAIL_DOMAIN}`, role: "manager" },
  { name: "本郷 拓也", email: `hongo_takuya@${EMAIL_DOMAIN}`, role: "manager" },
  { name: "渡辺 翼", email: `watanabe_tsubasa@${EMAIL_DOMAIN}`, role: "manager" },
  { name: "比佐 京太", email: `hisa_kyota@${EMAIL_DOMAIN}`, role: "manager" },
  { name: "澤野 大和", email: `sawano_yamato@${EMAIL_DOMAIN}`, role: "member" },
  { name: "原田 良輔", email: `harada_ryosuke@${EMAIL_DOMAIN}`, role: "member" },
  { name: "藤巻 卓優", email: `fujimaki_takumasa@${EMAIL_DOMAIN}`, role: "member" },
  { name: "渡邉 史仁", email: `watanabe_fumihito@${EMAIL_DOMAIN}`, role: "member" },
  { name: "沼倉 友香", email: `numakura_yuka@${EMAIL_DOMAIN}`, role: "member" },
  { name: "森下 加奈", email: `morishita_kana@${EMAIL_DOMAIN}`, role: "member" },
  { name: "岡本 みち子", email: `okamoto_mitiko@${EMAIL_DOMAIN}`, role: "member" },
  { name: "森下 陽奈", email: `morishita_hina@${EMAIL_DOMAIN}`, role: "member" },
];

async function main() {
  // ユーザーに紐づく子テーブルを先に削除
  await prisma.refuelingLog.deleteMany();
  await prisma.drivingLog.deleteMany();
  await prisma.vehicleAssignment.deleteMany();
  await prisma.dailyReportItem.deleteMany();
  await prisma.dailyReport.deleteMany();
  await prisma.overtimeRequest.deleteMany();
  await prisma.timeRecord.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.user.deleteMany();

  const hash = hashPassword(DEFAULT_PASSWORD);
  const now = new Date();

  for (const u of USERS) {
    await prisma.user.create({
      data: {
        name: u.name,
        role: u.role,
        loginId: u.email, // loginIdカラムをメアド兼用にする
        passwordHash: hash,
        passwordUpdatedAt: now,
        isActive: true,
      },
    });
  }

  console.log(`User count: ${await prisma.user.count()}`);
  console.log(`管理者(manager): ${await prisma.user.count({ where: { role: "manager" } })}`);
  console.log(`一般(member): ${await prisma.user.count({ where: { role: "member" } })}`);
  console.log(`\n初期パスワード: ${DEFAULT_PASSWORD}（全員共通・初回ログイン後に各自変更前提）`);
  console.log("メールアドレス一覧:");
  for (const u of USERS) {
    console.log(`  ${u.name.padEnd(8)}  ${u.email}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
