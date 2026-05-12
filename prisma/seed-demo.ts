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

function todayAtJST(h: number, m = 0): Date {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  jstNow.setUTCHours(h, m, 0, 0);
  return new Date(jstNow.getTime() - jstOffset);
}

async function main() {
  const users = await prisma.user.findMany();
  const idByName = new Map(users.map((u) => [u.name, u.id]));
  const uid = (name: string): string => {
    const id = idByName.get(name);
    if (!id) throw new Error(`user not found: ${name}`);
    return id;
  };

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  await prisma.timeRecord.deleteMany({ where: { timestamp: { gte: since } } });

  const punchRecords: { userId: string; type: string; timestamp: Date }[] = [
    // 髙山 澄人（代表取締役）: 朝出勤、午前外出退勤、午後再出勤中
    { userId: uid("髙山 澄人"), type: "IN", timestamp: todayAtJST(8, 0) },
    { userId: uid("髙山 澄人"), type: "OUT", timestamp: todayAtJST(11, 30) },
    { userId: uid("髙山 澄人"), type: "IN", timestamp: todayAtJST(14, 30) },

    // 保志 光秀（専務）: 朝から出勤中、まだ
    { userId: uid("保志 光秀"), type: "IN", timestamp: todayAtJST(7, 50) },

    // 武藤 飛翔（営業本部長）: 出勤→退勤済み
    { userId: uid("武藤 飛翔"), type: "IN", timestamp: todayAtJST(8, 30) },
    { userId: uid("武藤 飛翔"), type: "OUT", timestamp: todayAtJST(16, 0) },

    // 本郷 拓也（部長）: 出勤中
    { userId: uid("本郷 拓也"), type: "IN", timestamp: todayAtJST(8, 15) },

    // 渡辺 翼（工事部 部長）: 早朝6時出勤、まだ → 長時間勤務赤バー
    { userId: uid("渡辺 翼"), type: "IN", timestamp: todayAtJST(6, 0) },

    // 比佐 京太（課長）: 出勤→現場移動退勤、午後再出勤
    { userId: uid("比佐 京太"), type: "IN", timestamp: todayAtJST(7, 40) },
    { userId: uid("比佐 京太"), type: "OUT", timestamp: todayAtJST(12, 0) },
    { userId: uid("比佐 京太"), type: "IN", timestamp: todayAtJST(13, 0) },

    // 澤野 大和: 早朝出勤、まだ → 長時間勤務赤バー
    { userId: uid("澤野 大和"), type: "IN", timestamp: todayAtJST(6, 30) },

    // 原田 良輔: 出勤→退勤済み
    { userId: uid("原田 良輔"), type: "IN", timestamp: todayAtJST(8, 0) },
    { userId: uid("原田 良輔"), type: "OUT", timestamp: todayAtJST(15, 30) },

    // 藤巻 卓優: 出勤中
    { userId: uid("藤巻 卓優"), type: "IN", timestamp: todayAtJST(8, 45) },

    // 渡邉 史仁: 本日未出勤

    // 蛸と衣
    { userId: uid("沼倉 友香"), type: "IN", timestamp: todayAtJST(9, 0) },
    { userId: uid("沼倉 友香"), type: "OUT", timestamp: todayAtJST(15, 0) },
    { userId: uid("森下 加奈"), type: "IN", timestamp: todayAtJST(10, 0) },
    { userId: uid("岡本 みち子"), type: "IN", timestamp: todayAtJST(10, 30) },
    { userId: uid("岡本 みち子"), type: "OUT", timestamp: todayAtJST(15, 30) },
    // 森下 陽奈: 本日未出勤
  ];

  for (const r of punchRecords) {
    await prisma.timeRecord.create({ data: r });
  }
  console.log(`Seeded ${punchRecords.length} time records for today`);

  // ---------- 残業申請 ----------
  await prisma.overtimeRequest.deleteMany();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const wdToday = new Date(today.getTime() - 9 * 60 * 60 * 1000);
  const dayOffset = (n: number) =>
    new Date(wdToday.getTime() + n * 24 * 60 * 60 * 1000);
  const at = (wd: Date, hh: number, mm: number) =>
    new Date(wd.getTime() + (hh * 60 + mm) * 60 * 1000);

  const sites = await prisma.workSite.findMany();
  const siteByName = (n: string) =>
    sites.find((s) => s.name === n) ?? sites[0];

  type OvertimeData = Parameters<typeof prisma.overtimeRequest.create>[0]["data"];
  const create = (data: OvertimeData) => prisma.overtimeRequest.create({ data });

  // 承認済み 6件
  await create({
    userId: uid("澤野 大和"),
    workDate: dayOffset(-5),
    startAt: at(dayOffset(-5), 17, 30),
    endAt: at(dayOffset(-5), 20, 0),
    durationMinutes: 150,
    workSiteName: "仙台市役所 空調更新",
    workSiteId: siteByName("仙台市役所 空調更新").id,
    description: "搬入機器の据付調整。現場引き渡し前の最終確認",
    requestType: "pre",
    status: "approved",
    reviewerId: uid("本郷 拓也"),
    reviewedAt: dayOffset(-5),
  });
  await create({
    userId: uid("原田 良輔"),
    workDate: dayOffset(-4),
    startAt: at(dayOffset(-4), 18, 0),
    endAt: at(dayOffset(-4), 21, 0),
    durationMinutes: 180,
    workSiteName: "鶴巻ビル B棟 セントラル空調保守",
    workSiteId: siteByName("鶴巻ビル B棟 セントラル空調保守").id,
    description: "冷却塔の異音調査。閉店後の作業のため夜間対応",
    requestType: "post",
    status: "approved",
    reviewerId: uid("渡辺 翼"),
    reviewedAt: dayOffset(-4),
  });
  await create({
    userId: uid("藤巻 卓優"),
    workDate: dayOffset(-3),
    startAt: at(dayOffset(-3), 17, 30),
    endAt: at(dayOffset(-3), 19, 0),
    durationMinutes: 90,
    workSiteName: "若林マンション パッケージ空調入替",
    workSiteId: siteByName("若林マンション パッケージ空調入替").id,
    description: "既設機の搬出残作業と廃材整理",
    requestType: "pre",
    status: "approved",
    reviewerId: uid("本郷 拓也"),
    reviewedAt: dayOffset(-3),
  });
  await create({
    userId: uid("渡邉 史仁"),
    workDate: dayOffset(-2),
    startAt: at(dayOffset(-2), 17, 30),
    endAt: at(dayOffset(-2), 20, 30),
    durationMinutes: 180,
    workSiteName: "名取オフィス 換気設備工事",
    workSiteId: siteByName("名取オフィス 換気設備工事").id,
    description: "ダクト改修工事の補助、配管接続作業",
    requestType: "pre",
    status: "approved",
    reviewerId: uid("渡辺 翼"),
    reviewedAt: dayOffset(-2),
  });
  await create({
    userId: uid("比佐 京太"),
    workDate: dayOffset(-2),
    startAt: at(dayOffset(-2), 17, 30),
    endAt: at(dayOffset(-2), 19, 30),
    durationMinutes: 120,
    workSiteName: "本社事務所",
    workSiteId: siteByName("本社事務所").id,
    description: "月次の工事案件進捗まとめと営業会議資料作成",
    requestType: "pre",
    status: "approved",
    reviewerId: uid("武藤 飛翔"),
    reviewedAt: dayOffset(-2),
  });
  await create({
    userId: uid("原田 良輔"),
    workDate: dayOffset(-1),
    startAt: at(dayOffset(-1), 17, 30),
    endAt: at(dayOffset(-1), 19, 0),
    durationMinutes: 90,
    workSiteName: "仙台市役所 空調更新",
    workSiteId: siteByName("仙台市役所 空調更新").id,
    description: "翌日の検査立会いに向けた前準備",
    requestType: "pre",
    status: "approved",
    reviewerId: uid("本郷 拓也"),
    reviewedAt: dayOffset(-1),
  });

  // 申請中 3件（本日）
  await create({
    userId: uid("澤野 大和"),
    workDate: wdToday,
    startAt: at(wdToday, 17, 30),
    endAt: at(wdToday, 19, 0),
    durationMinutes: 90,
    workSiteName: "仙台市役所 空調更新",
    workSiteId: siteByName("仙台市役所 空調更新").id,
    description: "試運転時の制御パラメータ調整。施主立会いのため定時超過",
    requestType: "pre",
    status: "submitted",
  });
  await create({
    userId: uid("藤巻 卓優"),
    workDate: wdToday,
    startAt: at(wdToday, 18, 0),
    endAt: at(wdToday, 20, 45),
    durationMinutes: 165,
    workSiteName: "鶴巻ビル B棟 セントラル空調保守",
    workSiteId: siteByName("鶴巻ビル B棟 セントラル空調保守").id,
    description: "冷凍機の緊急停止対応、ガス漏れ確認と一次修繕",
    requestType: "post",
    status: "submitted",
  });
  await create({
    userId: uid("渡邉 史仁"),
    workDate: wdToday,
    startAt: at(wdToday, 17, 30),
    endAt: at(wdToday, 18, 30),
    durationMinutes: 60,
    workSiteName: "若林マンション パッケージ空調入替",
    workSiteId: siteByName("若林マンション パッケージ空調入替").id,
    description: "資材搬入の遅延対応、明日の段取り調整",
    requestType: "pre",
    status: "submitted",
  });

  // 差戻 1件
  await create({
    userId: uid("原田 良輔"),
    workDate: dayOffset(-1),
    startAt: at(dayOffset(-1), 17, 30),
    endAt: at(dayOffset(-1), 22, 0),
    durationMinutes: 270,
    workSiteName: "名取オフィス 換気設備工事",
    workSiteId: siteByName("名取オフィス 換気設備工事").id,
    description: "現場対応",
    requestType: "post",
    status: "sent_back",
    reviewerId: uid("渡辺 翼"),
    reviewedAt: new Date(),
    reviewComment:
      "具体的な作業内容を記載してください（どの工程に何時間かかったか）。",
  });

  const counts = await prisma.overtimeRequest.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("Overtime requests:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
