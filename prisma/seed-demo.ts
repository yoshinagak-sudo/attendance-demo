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

  // ---------- 車両管理 ----------
  await prisma.refuelingLog.deleteMany();
  await prisma.drivingLog.deleteMany();
  await prisma.vehicleAssignment.deleteMany();
  await prisma.vehicle.deleteMany();

  const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  const v1 = await prisma.vehicle.create({
    data: {
      plate: "宮城500あ12-34",
      model: "ハイエース",
      depot: "仙台営業所",
      inspectionDueDate: inDays(120),
      vehicleInspectionDueDate: inDays(540), // 約1年半
    },
  });
  const v2 = await prisma.vehicle.create({
    data: {
      plate: "宮城500あ56-78",
      model: "ハイエース",
      depot: "仙台営業所",
      inspectionDueDate: inDays(18), // 点検警告対象
      vehicleInspectionDueDate: inDays(45), // 車検警告対象
    },
  });
  const v3 = await prisma.vehicle.create({
    data: {
      plate: "宮城500い90-12",
      model: "キャラバン",
      depot: "名取出張所",
      inspectionDueDate: inDays(220),
      vehicleInspectionDueDate: inDays(28), // 車検警告対象（30日以内）
    },
  });
  const v4 = await prisma.vehicle.create({
    data: {
      plate: "宮城480あ34-56",
      model: "軽トラ（ハイゼット）",
      depot: "仙台営業所",
      inspectionDueDate: null,
      vehicleInspectionDueDate: inDays(380),
    },
  });
  const v5 = await prisma.vehicle.create({
    data: {
      plate: "宮城500う78-90",
      model: "プロボックス",
      depot: "仙台営業所",
      inspectionDueDate: inDays(60),
      vehicleInspectionDueDate: inDays(7), // 車検警告対象・緊急
    },
  });

  // 当日割当
  await prisma.vehicleAssignment.create({
    data: { vehicleId: v1.id, userId: uid("澤野 大和"), assignDate: wdToday },
  });
  await prisma.vehicleAssignment.create({
    data: { vehicleId: v2.id, userId: uid("原田 良輔"), assignDate: wdToday },
  });
  await prisma.vehicleAssignment.create({
    data: { vehicleId: v3.id, userId: uid("藤巻 卓優"), assignDate: wdToday },
  });

  // 走行ログ（完了2件 + 進行中1件）
  await prisma.drivingLog.create({
    data: {
      vehicleId: v1.id,
      userId: uid("澤野 大和"),
      workDate: wdToday,
      startAt: at(wdToday, 8, 30),
      startOdometer: 48201,
      endAt: at(wdToday, 11, 45),
      endOdometer: 48267,
      distanceKm: 66,
      purpose: "据付",
      workSiteName: "仙台市役所 空調更新",
      workSiteId: siteByName("仙台市役所 空調更新").id,
      status: "completed",
    },
  });
  await prisma.drivingLog.create({
    data: {
      vehicleId: v2.id,
      userId: uid("原田 良輔"),
      workDate: wdToday,
      startAt: at(wdToday, 9, 0),
      startOdometer: 72101,
      endAt: at(wdToday, 14, 30),
      endOdometer: 72178,
      distanceKm: 77,
      purpose: "保守点検",
      workSiteName: "鶴巻ビル B棟 セントラル空調保守",
      workSiteId: siteByName("鶴巻ビル B棟 セントラル空調保守").id,
      status: "completed",
    },
  });
  await prisma.drivingLog.create({
    data: {
      vehicleId: v3.id,
      userId: uid("藤巻 卓優"),
      workDate: wdToday,
      startAt: at(wdToday, 10, 0),
      startOdometer: 35912,
      purpose: "資材引取",
      workSiteName: "若林マンション パッケージ空調入替",
      workSiteId: siteByName("若林マンション パッケージ空調入替").id,
      status: "in_progress",
    },
  });
  // 過去日の完了ログ
  await prisma.drivingLog.create({
    data: {
      vehicleId: v1.id,
      userId: uid("澤野 大和"),
      workDate: dayOffset(-1),
      startAt: at(dayOffset(-1), 8, 15),
      startOdometer: 48140,
      endAt: at(dayOffset(-1), 17, 20),
      endOdometer: 48201,
      distanceKm: 61,
      purpose: "据付",
      workSiteName: "仙台市役所 空調更新",
      workSiteId: siteByName("仙台市役所 空調更新").id,
      status: "completed",
    },
  });
  await prisma.drivingLog.create({
    data: {
      vehicleId: v2.id,
      userId: uid("原田 良輔"),
      workDate: dayOffset(-1),
      startAt: at(dayOffset(-1), 8, 30),
      startOdometer: 72015,
      endAt: at(dayOffset(-1), 17, 0),
      endOdometer: 72101,
      distanceKm: 86,
      purpose: "保守点検",
      workSiteName: "名取オフィス 換気設備工事",
      workSiteId: siteByName("名取オフィス 換気設備工事").id,
      status: "completed",
    },
  });

  // 給油ログ
  await prisma.refuelingLog.create({
    data: {
      vehicleId: v1.id,
      userId: uid("澤野 大和"),
      refuelDate: dayOffset(-2),
      liters: 42.5,
      amountJpy: 7480,
      stationName: "ENEOS 仙台青葉SS",
      note: null,
    },
  });
  await prisma.refuelingLog.create({
    data: {
      vehicleId: v2.id,
      userId: uid("原田 良輔"),
      refuelDate: dayOffset(-3),
      liters: 38.0,
      amountJpy: 6688,
      stationName: "出光 若林南店",
      note: null,
    },
  });
  await prisma.refuelingLog.create({
    data: {
      vehicleId: v3.id,
      userId: uid("藤巻 卓優"),
      refuelDate: dayOffset(-4),
      liters: 45.2,
      amountJpy: 7956,
      stationName: "ENEOS 名取SS",
      note: "高速利用前に満タン",
    },
  });

  console.log("Vehicles:", await prisma.vehicle.count());
  console.log("DrivingLogs:", await prisma.drivingLog.count());
  console.log("RefuelingLogs:", await prisma.refuelingLog.count());

  // ---------- 日報 ----------
  await prisma.dailyReportItem.deleteMany();
  await prisma.dailyReport.deleteMany();

  // 1. 提出済 (澤野 大和、当日)
  const r1 = await prisma.dailyReport.create({
    data: {
      userId: uid("澤野 大和"),
      reportDate: wdToday,
      progressNote:
        "市役所空調更新の据付調整、進捗順調。明日は試運転と引渡し前検査。\n配管材で30A継手が3個不足、明日の朝イチで追加発注予定。",
      totalMinutes: 0,
      status: "submitted",
      submittedAt: new Date(),
    },
  });
  await prisma.dailyReportItem.createMany({
    data: [
      {
        reportId: r1.id,
        orderIndex: 0,
        startAt: at(wdToday, 8, 30),
        endAt: at(wdToday, 12, 0),
        durationMinutes: 210,
        description: "搬入機器の据付調整",
        workSiteName: "仙台市役所 空調更新",
        workSiteId: siteByName("仙台市役所 空調更新").id,
      },
      {
        reportId: r1.id,
        orderIndex: 1,
        startAt: at(wdToday, 13, 0),
        endAt: at(wdToday, 17, 30),
        durationMinutes: 270,
        description: "配管接続と気密試験",
        workSiteName: "仙台市役所 空調更新",
        workSiteId: siteByName("仙台市役所 空調更新").id,
      },
    ],
  });
  await prisma.dailyReport.update({
    where: { id: r1.id },
    data: { totalMinutes: 480 },
  });

  // 2. 下書き (原田 良輔、当日)
  const r2 = await prisma.dailyReport.create({
    data: {
      userId: uid("原田 良輔"),
      reportDate: wdToday,
      progressNote: "鶴巻ビル冷却塔の異音調査。原因はベルト摩耗、明日交換予定。",
      totalMinutes: 0,
      status: "draft",
    },
  });
  await prisma.dailyReportItem.create({
    data: {
      reportId: r2.id,
      orderIndex: 0,
      startAt: at(wdToday, 9, 0),
      endAt: at(wdToday, 14, 30),
      durationMinutes: 330,
      description: "冷却塔ベルト点検と原因切り分け",
      workSiteName: "鶴巻ビル B棟 セントラル空調保守",
      workSiteId: siteByName("鶴巻ビル B棟 セントラル空調保守").id,
    },
  });
  await prisma.dailyReport.update({
    where: { id: r2.id },
    data: { totalMinutes: 330 },
  });

  // 3. 確認済 (藤巻 卓優、3日前)
  const r3 = await prisma.dailyReport.create({
    data: {
      userId: uid("藤巻 卓優"),
      reportDate: dayOffset(-3),
      progressNote:
        "既設機の搬出残作業と廃材整理。残材は産廃業者引取済み。\n次工程は明日からの新設機据付。",
      totalMinutes: 360,
      status: "acknowledged",
      submittedAt: dayOffset(-3),
      acknowledgedById: uid("本郷 拓也"),
      acknowledgedAt: dayOffset(-2),
      ackComment: "了解しました。次工程よろしくお願いします。",
    },
  });
  await prisma.dailyReportItem.createMany({
    data: [
      {
        reportId: r3.id,
        orderIndex: 0,
        startAt: at(dayOffset(-3), 8, 30),
        endAt: at(dayOffset(-3), 12, 0),
        durationMinutes: 210,
        description: "既設機搬出作業",
        workSiteName: "若林マンション パッケージ空調入替",
        workSiteId: siteByName("若林マンション パッケージ空調入替").id,
      },
      {
        reportId: r3.id,
        orderIndex: 1,
        startAt: at(dayOffset(-3), 13, 0),
        endAt: at(dayOffset(-3), 15, 30),
        durationMinutes: 150,
        description: "廃材整理と産廃業者引渡し",
        workSiteName: "若林マンション パッケージ空調入替",
        workSiteId: siteByName("若林マンション パッケージ空調入替").id,
      },
    ],
  });

  // 4. 提出済 (渡邉 史仁、当日)
  const r4 = await prisma.dailyReport.create({
    data: {
      userId: uid("渡邉 史仁"),
      reportDate: wdToday,
      progressNote: "名取オフィスの換気設備工事補助、ダクト接続まで完了。",
      totalMinutes: 0,
      status: "submitted",
      submittedAt: new Date(),
    },
  });
  await prisma.dailyReportItem.createMany({
    data: [
      {
        reportId: r4.id,
        orderIndex: 0,
        startAt: at(wdToday, 8, 0),
        endAt: at(wdToday, 12, 30),
        durationMinutes: 270,
        description: "ダクト接続作業",
        workSiteName: "名取オフィス 換気設備工事",
        workSiteId: siteByName("名取オフィス 換気設備工事").id,
      },
      {
        reportId: r4.id,
        orderIndex: 1,
        startAt: at(wdToday, 13, 30),
        endAt: at(wdToday, 17, 0),
        durationMinutes: 210,
        description: "気密試験と保温施工",
        workSiteName: "名取オフィス 換気設備工事",
        workSiteId: siteByName("名取オフィス 換気設備工事").id,
      },
    ],
  });
  await prisma.dailyReport.update({
    where: { id: r4.id },
    data: { totalMinutes: 480 },
  });

  console.log("DailyReports:", await prisma.dailyReport.count());
  console.log("DailyReportItems:", await prisma.dailyReportItem.count());
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
