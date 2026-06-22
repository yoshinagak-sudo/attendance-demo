/**
 * 開発者アカウント追加スクリプト（既存ユーザーには触らず、無ければ作成・あれば更新）
 *   name=開発者 / loginId=ai@smart-media.co.jp / role=developer / password=password123
 */
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { hashPassword } from "../lib/password";

function makePrisma(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL が未設定です。本番DBへ書き込むスクリプトのため、" +
        "Turso URL/Token を export してから実行してください。" +
        "（vercel env pull で取れない場合は turso db shell で直接 SQL を流すのが確実）",
    );
  }
  return new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken }) });
}

const prisma = makePrisma();

const DEV = {
  name: "開発者",
  loginId: "ai@smart-media.co.jp",
  role: "developer" as const,
  password: "password123",
};

async function main() {
  const hash = hashPassword(DEV.password);
  const now = new Date();

  const existing = await prisma.user.findUnique({ where: { loginId: DEV.loginId } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: DEV.name,
        role: DEV.role,
        passwordHash: hash,
        passwordUpdatedAt: now,
        isActive: true,
      },
    });
    console.log(`[updated] ${DEV.loginId} (id=${existing.id})`);
  } else {
    const created = await prisma.user.create({
      data: {
        name: DEV.name,
        role: DEV.role,
        loginId: DEV.loginId,
        passwordHash: hash,
        passwordUpdatedAt: now,
        isActive: true,
      },
    });
    console.log(`[created] ${DEV.loginId} (id=${created.id})`);
  }

  const summary = {
    total: await prisma.user.count(),
    developer: await prisma.user.count({ where: { role: "developer" } }),
    manager: await prisma.user.count({ where: { role: "manager" } }),
    member: await prisma.user.count({ where: { role: "member" } }),
  };
  console.log("user counts:", summary);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
