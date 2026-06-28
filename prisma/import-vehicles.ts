import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

function makePrisma(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (url) {
    return new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken }) });
  }
  return new PrismaClient();
}

const prisma = makePrisma();

type Row = {
  plate: string;
  maker: string;
  model: string;
  color: string;
  fuel: string;
  depot: string;
  inspection: Date | null;
  notes?: string;
};

// 「R.8.6.13」「R8.2」等の令和表記を西暦Dateに。null可。
function parseReiwa(raw: string | null): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // 「R.YY.MM.DD」「RYY.MM.DD」「RYY.M」など
  const m = s.match(/^R\.?(\d+)(?:[\.\/](\d+))?(?:[\.\/](\d+))?$/);
  if (!m) return null;
  const ry = Number(m[1]);
  const mm = Number(m[2] || 1);
  const dd = Number(m[3] || 1);
  const year = 2018 + ry; // 令和元年 = 2019
  return new Date(Date.UTC(year, mm - 1, dd) - 9 * 60 * 60 * 1000);
}

const VEHICLES: Row[] = [
  { plate: "仙台334 そ5005", maker: "トヨタ", model: "プリウスアルファ S", color: "白", fuel: "ガソリン", depot: "技術部", inspection: null, notes: "保志 光秀（専務）" },
  { plate: "仙台430 せ5005", maker: "トヨタ", model: "ハイエース", color: "白", fuel: "ディーゼル", depot: "技術部", inspection: parseReiwa("R.8.6.17"), notes: "武藤 飛翔（取締役）" },
  { plate: "仙台430 も5005", maker: "トヨタ", model: "プロボックス", color: "シルバー", fuel: "ガソリン", depot: "技術部", inspection: parseReiwa("R.10.2.15"), notes: "本郷 拓也（部長）" },
  { plate: "仙台430 め5005", maker: "トヨタ", model: "プロボックス", color: "シルバー", fuel: "ガソリン", depot: "技術部", inspection: parseReiwa("R.10.2.15"), notes: "比佐 京太（課長）" },
  { plate: "仙台430 む5005", maker: "トヨタ", model: "ハイエース", color: "シルバー", fuel: "ディーゼル", depot: "技術部", inspection: parseReiwa("R.11.2.11"), notes: "渡辺 翼（工事部）" },
  { plate: "仙台430 ま5005", maker: "トヨタ", model: "プロボックス", color: "白", fuel: "ガソリン", depot: "技術部", inspection: new Date("2026-10-22T00:00:00+09:00"), notes: "澤野 大和" },
  { plate: "仙台532 ち5005", maker: "トヨタ", model: "カローラフィールダー", color: "シルバー", fuel: "ガソリン", depot: "営業部", inspection: parseReiwa("R10.5.6"), notes: "原田 良輔" },
  { plate: "仙台430 は5005", maker: "トヨタ", model: "プロボックス", color: "シルバー", fuel: "ガソリン", depot: "技術部", inspection: parseReiwa("R9.4.25"), notes: "藤巻 卓優" },
  { plate: "仙台532 て5005", maker: "トヨタ", model: "ビッツ", color: "白", fuel: "ガソリン", depot: "営業部", inspection: parseReiwa("R10.3.27"), notes: "渡邉 史仁" },
  { plate: "仙台430 ひ5005", maker: "トヨタ", model: "ハイエース", color: "白", fuel: "ディーゼル", depot: "技術部", inspection: parseReiwa("R9.2.26"), notes: "作業車（保志）" },
  { plate: "仙台483 う5005", maker: "ダイハツ", model: "ハイゼットカーゴ", color: "カーキ", fuel: "ガソリン", depot: "技術部", inspection: parseReiwa("R8.5.26"), notes: "作業車" },
  { plate: "仙台430 そ5005", maker: "トヨタ", model: "ダイナ", color: "白", fuel: "ディーゼル", depot: "技術部", inspection: null, notes: "作業車（車検証待ち）" },
  { plate: "仙台430 な5005", maker: "トヨタ", model: "プロボックス（4WD）", color: "シルバー", fuel: "ガソリン", depot: "技術部", inspection: parseReiwa("R.8.6.13"), notes: "予備" },
  { plate: "仙台 5005", maker: "メルセデス", model: "（社長用）", color: "黒", fuel: "ハイオク", depot: "総務部", inspection: null, notes: "社長用車" },
];

async function main() {
  // 既存の走行・給油・割当・車両を全削除して入れ直し
  await prisma.refuelingLog.deleteMany();
  await prisma.drivingLog.deleteMany();
  await prisma.vehicleAssignment.deleteMany();
  await prisma.vehicle.deleteMany();

  for (const v of VEHICLES) {
    await prisma.vehicle.create({
      data: {
        plate: v.plate,
        model: `${v.maker} ${v.model}（${v.color}）`,
        depot: v.notes ? `${v.depot} / ${v.notes}` : v.depot,
        vehicleInspectionDueDate: v.inspection,
        inspectionDueDate: null,
        isActive: true,
      },
    });
  }

  const count = await prisma.vehicle.count();
  console.log(`Vehicles imported: ${count}`);

  // 期限が近い順に確認
  const sorted = await prisma.vehicle.findMany({
    where: { vehicleInspectionDueDate: { not: null } },
    orderBy: { vehicleInspectionDueDate: "asc" },
    take: 5,
  });
  for (const v of sorted) {
    const d = v.vehicleInspectionDueDate?.toISOString().slice(0, 10);
    console.log(`  ${d}  ${v.plate}  ${v.model}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
