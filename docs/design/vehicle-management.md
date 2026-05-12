# 車両管理機能 設計書

最終更新: 2026-05-12
担当: architect
対象: butaifarm-attendance/web/

---

## 背景と目的

ニナウ社（仙台空調設備）向け勤怠デモアプリに「車両管理機能」を追加する。同社は社員14名のうちmember 8名が現場直行で社用車を使い、空調設備の据付・保守を回る業態。営業デモで「勤怠と現場移動が紐付く」「給油代の月次集計が出る」を見せ、汎用勤怠SaaSとの差別化を訴求する。

**前提（重要・誤解しやすい）**:
- 本番運用ではなくデモ用途。車両法・自動車運転日報の法令準拠（運行管理者選任が必要な事業区分の対応 等）はスコープ外。空調設備業は緑ナンバー登録車両を保有しないので運行記録計（タコグラフ）連動も不要。
- 既存スタック踏襲: Next.js 16（App Router + `proxy.ts`、`use server`）/ Prisma 6 / libsql(Turso) / plain CSS（`.ot-*` 命名規則の派生として `.vh-*` を新設）/ React 19。新ライブラリ・新スタイル体系は導入しない。
- 認証は既存 `lib/session.ts` の `member` / `manager` を流用。**新規ロール追加禁止**。manager 6 / member 8 を seed 済み前提（CLAUDE.md記載のニナウ社員14名）。
- 日付/時刻は `lib/time.ts` の JST helpers を必ず使う。`new Date()` を直接画面で整形しない。
- **実装担当者は `node_modules/next/dist/docs/` を読むこと**（AGENTS.md指示）。Server Actions/Route Handlersの API は本設計書ではなくそちらを正とする。

---

## スコープ

### 含むもの

| ID | 内容 |
|---|---|
| S-1 | 社用車マスタ（車両番号・車種・所属拠点・点検期限） |
| S-2 | 当日の使用者割当（一人一日一台が基本、上書きで他者に変更可） |
| S-3 | 走行記録（出発時走行距離 / 帰着時走行距離 / 目的 / 行先＝WorkSite） |
| S-4 | 給油記録（給油日 / 量L / 金額 / 場所） |
| S-5 | スマホ画面で現場社員が登録（タッチターゲット56px以上、既存タブレット運用と同じ思想） |
| S-6 | manager 向け一覧（当日割当 / 走行 / 給油 / 点検期限アラート） |
| S-7 | 月次レポート（車両別走行距離・燃費・給油代総額・社員別走行距離） |
| S-8 | CSV出力（走行明細・給油明細 各UTF-8 BOM付き） |
| S-9 | `/admin/settings/vehicle` で車両マスタを追加・無効化 |

### 含まないもの（非スコープ）

| ID | 内容 | 理由 |
|---|---|---|
| NS-1 | 運行管理者法令準拠（点呼記録・アルコールチェック義務） | 業種柄不要（緑ナンバー非該当）。デモで「対応可能性あり」と口頭言及のみ |
| NS-2 | 走行ログのGPS自動取得 | スマホ位置情報の常時取得は権限ハードル高、デモには不要 |
| NS-3 | 燃料カード連携 / 経費精算SaaS連携 | researcher 案件、後続フェーズ |
| NS-4 | 車検・任意保険の有効期限管理（点検期限のみ持つ） | デモは点検期限の警告まで。車検は将来 `Vehicle` モデル拡張で対応可 |
| NS-5 | 複数日にまたがる出張運行（前日19時発・翌日7時帰着など） | 「失敗モード」§10 で扱いを明示 |

---

## 要件

### 機能要件

| ID | 要件 |
|---|---|
| F-1 | manager が車両マスタを登録・編集できる（plate / model / depot / inspectionDueDate） |
| F-2 | member は当日空いている車両を選び「割当（自分が使う）」できる |
| F-3 | 1日1社員あたり1台が基本。割当済の社員が別車両に切替えるときは前の割当を自動 release する |
| F-4 | 走行記録は「出発時」「帰着時」の2段階で入力（出発時はstartOdometer・目的・行先WorkSite、帰着時はendOdometerのみ追記） |
| F-5 | 出発のみで帰着未入力の状態を「進行中」として一覧で識別できる |
| F-6 | endOdometer < startOdometer の場合はエラー（メーター戻りなし） |
| F-7 | 走行距離 = endOdometer - startOdometer をDB保存値として持つ |
| F-8 | 行先は既存 `WorkSite` マスタを再利用（残業申請と同じテーブル）。新規入力は upsert |
| F-9 | 給油記録は別途追加（給油日 / liters / amountJpy / station自由記述） |
| F-10 | manager は車両別・社員別・月別の集計を見られる |
| F-11 | CSV: 走行明細 `driving_<YYYY-MM>.csv`、給油明細 `refueling_<YYYY-MM>.csv` の2本 |
| F-12 | 点検期限が30日以内に迫っている車両を `/admin/vehicle` トップに警告表示 |

### 非機能要件

| ID | 要件 |
|---|---|
| NF-1 | スマホ単独運用想定（モバイルファースト）。既存打刻・残業申請と同じデザイントークン |
| NF-2 | SQLite/libsql制約: enum未対応 → 文字列+`assertXxx` 型ガード（残業申請と同じパターン） |
| NF-3 | 楽観ロック: 帰着登録時に `where: { id, status: "in_progress" }` で `updateMany` 競合検知 |
| NF-4 | proxy.ts の PUBLIC_API_PREFIXES の **追加は不要**（全てログイン必須。`/admin/*` は manager のみで既存ルールに乗る） |
| NF-5 | デザイントークン遵守: `--primary` / `--warn` / `--danger` / `--surface` を使用、新色は導入しない |

---

## 採用案

### A. 画面構成

申請者側（member 含む全員）と管理者側（manager 限定）を `/admin` 配下で分ける既存パターンを踏襲する。

- `/vehicle` … member 向けエントリ。上部に「今日の自分の割当」カード、下に「割当可能な車両一覧」と「直近の走行・給油履歴」
- `/vehicle/assign` … 車両割当（タップで自分に割り当てる、当日のみ）。確認ダイアログなしで1タップ完了（タブレット運用速度優先）
- `/vehicle/driving/start` … 走行開始入力（startOdometer / purpose / workSite）
- `/vehicle/driving/[id]` … 進行中走行の詳細＋帰着入力（endOdometer のみ追記）
- `/vehicle/refueling/new` … 給油記録入力
- `/vehicle/history` … 自分の過去走行・給油履歴
- `/admin/vehicle` … 管理ダッシュボード（当日割当一覧 / 進行中走行 / 点検期限アラート）
- `/admin/vehicle/report` … 月次レポート（車両別 / 社員別 + CSV ダウンロード）
- `/admin/settings/vehicle` … 車両マスタ管理（追加・無効化・点検期限更新）

**遷移図（テキスト）**:

```
member: /vehicle ──tap──▶ /vehicle/assign (1タップ割当)
          │
          ├── 自分の割当ありの場合
          │   ├──▶ /vehicle/driving/start (出発登録)
          │   │      └──▶ /vehicle/driving/[id] (進行中)
          │   │             └──▶ same page で endOdometer 追記 ──▶ /vehicle?completed=1
          │   └──▶ /vehicle/refueling/new (給油登録)
          └── 履歴: /vehicle/history

manager: /admin ──link──▶ /admin/vehicle
                              ├── 点検期限アラート（30日以内）
                              ├── 今日の割当一覧（テーブル）
                              ├── 進行中の走行（テーブル）
                              ├──▶ /admin/vehicle/report (月次)
                              │      └── CSVダウンロード
                              └──▶ /admin/settings/vehicle (マスタ)
```

### B. データモデル（Prisma）

既存 `prisma/schema.prisma` の末尾に追加する。既存モデルへの破壊的変更はしない。

```prisma
model Vehicle {
  id                  String                @id @default(cuid())
  plate               String                @unique           // 車両番号 例: "宮城500あ12-34"
  model               String                                  // 車種 例: "ハイエース"
  depot               String                                  // 所属拠点 例: "仙台営業所"
  inspectionDueDate   DateTime?                               // 次回点検期限（任意）。null可
  isActive            Boolean               @default(true)
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt

  assignments         VehicleAssignment[]
  drivingLogs         DrivingLog[]
  refuelingLogs       RefuelingLog[]

  @@index([isActive])
  @@index([inspectionDueDate])
}

model VehicleAssignment {
  id          String   @id @default(cuid())
  vehicleId   String
  vehicle     Vehicle  @relation(fields: [vehicleId], references: [id])
  userId      String
  user        User     @relation("VehicleAssignedUser", fields: [userId], references: [id])

  // 割当対象日（JST 0時のUTC表現。残業の workDate と同じ流儀）
  assignDate  DateTime

  // 割当解除（次の人に渡した・自分で解除した）の時刻。null=有効
  releasedAt  DateTime?

  createdAt   DateTime @default(now())

  // 「同一車両×同一日×有効割当」が1件に収まることを論理的に保証するため
  // releasedAt が NULL の行は1台あたり1日1件想定（DB制約はSQLiteでNULL扱いの限界があり、
  // アプリ層で `updateMany` + `where releasedAt: null` で楽観的に直列化）
  @@index([vehicleId, assignDate])
  @@index([userId, assignDate])
}

model DrivingLog {
  id            String     @id @default(cuid())
  vehicleId     String
  vehicle       Vehicle    @relation(fields: [vehicleId], references: [id])
  userId        String
  user          User       @relation("DrivingLogUser", fields: [userId], references: [id])

  // 業務日（JST 0時）。割当の assignDate と一致させる
  workDate      DateTime

  // 出発
  startAt       DateTime
  startOdometer Int                                         // km単位
  purpose       String                                       // 自由記述 例: "据付", "保守点検", "資材引取"
  workSiteName  String                                       // スナップショット保存（残業申請と同じ流儀）
  workSiteId    String?
  workSite      WorkSite?  @relation("DrivingLogSite", fields: [workSiteId], references: [id])

  // 帰着（未帰着時 null）
  endAt         DateTime?
  endOdometer   Int?

  // 走行距離（保存値、endOdometer - startOdometer）。未帰着時 null
  distanceKm    Int?

  // 状態（"in_progress" | "completed"）。SQLiteなので文字列+型ガード
  status        String     @default("in_progress")

  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  @@index([vehicleId, workDate])
  @@index([userId, workDate])
  @@index([status, workDate])
  @@index([workDate])
}

model RefuelingLog {
  id            String   @id @default(cuid())
  vehicleId     String
  vehicle       Vehicle  @relation(fields: [vehicleId], references: [id])
  userId        String
  user          User     @relation("RefuelingLogUser", fields: [userId], references: [id])

  // 給油日（JST 0時）
  refuelDate    DateTime

  liters        Float                                        // 給油量 (L) 小数1桁想定
  amountJpy     Int                                          // 金額（円・整数）
  stationName   String                                       // 給油所自由記述 例: "ENEOS 仙台○○SS"
  note          String?                                      // 任意メモ 50文字

  createdAt     DateTime @default(now())

  @@index([vehicleId, refuelDate])
  @@index([refuelDate])
}
```

`User` モデルに以下の relation を追加（既存フィールドは変更しない）:

```prisma
model User {
  // 既存フィールド (id / name / role / loginId / ...) は変更なし
  // 追加:
  vehicleAssignments  VehicleAssignment[] @relation("VehicleAssignedUser")
  drivingLogs         DrivingLog[]        @relation("DrivingLogUser")
  refuelingLogs       RefuelingLog[]      @relation("RefuelingLogUser")
}
```

`WorkSite` モデルに以下の relation を追加（既存フィールドは変更しない）:

```prisma
model WorkSite {
  // 既存フィールド (id / name / isActive / usageCount / createdAt / requests) は変更なし
  // 追加:
  drivingLogs DrivingLog[] @relation("DrivingLogSite")
}
```

**設計判断のポイント**:

| 判断 | 理由 |
|---|---|
| `Vehicle.plate` を `@unique` | 重複登録防止。表記ゆれは `.trim().normalize("NFKC")` をサーバー側で強制（残業の `workSiteName` と同じ） |
| 割当に `releasedAt` を持つ（startedAt / endedAt 方式ではなく） | 1日1割当の論理一意性をアプリ層で取りやすい。release は自動も手動も同一カラムで表現できる |
| `DrivingLog.workSiteName` を文字列スナップショット | マスタ改名で過去ログが書き換わるのを防ぐ。残業申請と同じ流儀で統一感 |
| `distanceKm` を Int で保存（毎回計算ではなく） | CSV/集計のズレ防止。`endOdometer` 設定時にサーバーで計算 |
| `inspectionDueDate` を nullable | 既存車両の点検期限が分からない初期投入を許容 |
| `liters` を Float、`amountJpy` を Int | リッターは小数1桁、金額は整数。集計時の丸め誤差を避ける |
| `status` を文字列 enum 風 | SQLiteの制約。`lib/vehicle.ts` で `"in_progress" \| "completed"` の Union 型と `assertDrivingStatus` を提供 |
| `purpose` を文字列のみ（マスタ化しない） | 「据付/保守/資材引取/その他」のような分類は将来 enum 化検討、デモはYAGNI |

### C. 状態遷移

#### 車両割当（VehicleAssignment）

```
                +-----------+
                | (initial) |
                +-----+-----+
                      | assignVehicle(userId, vehicleId, today)
                      v
                +-----+-----+
                |  active   | (releasedAt = NULL)
                +-----+-----+
                      |
       +------ release/reassign -------+
       |              |                |
       v              v                v
   manualRelease  自動release       割当日の翌朝         
   (本人/manager) (本人が他車両に切替) (Cron外、現状は    
                                     「過去日割当」として残置)
                      |
                      v
                +-----+-----+
                | released  | (releasedAt 設定済)
                +-----------+
```

| 遷移 | 操作者 | 制約 |
|---|---|---|
| `(none) → active` | member 本人 or manager | `assignDate=今日(JST)` 必須。同日に同一userの active 割当があれば自動 release（楽観ロック） |
| `active → released` | 本人 or manager | アクティブ走行ログがあれば警告（送信は許可、UIで警告） |
| `active → 翌日 (放置)` | - | 自動release はしない。月次集計時に「assignDate < 今日」のものは集計に含めるが画面の「今日の割当」には表示しない |

#### 走行ログ（DrivingLog）

```
        +---------+   addStart   +--------------+   addEnd    +-----------+
        | (none)  | -----------> | in_progress  | ----------> | completed |
        +---------+              +--------------+             +-----------+
                                         |
                                         | cancel (本人のみ、出発直後の取消)
                                         v
                                    (物理削除)
```

| 遷移 | 操作者 | 制約 |
|---|---|---|
| `(none) → in_progress` | member 本人 | 当該日に同一userの `in_progress` がある場合は警告（複数進行中はバグ温床、UIで「未帰着があります」表示） |
| `in_progress → completed` | 本人 or manager | `endOdometer >= startOdometer` 必須、`endAt >= startAt` 必須、楽観ロック |
| `in_progress → (削除)` | 本人のみ | 出発直後5分以内に限り取消可（誤入力対策）。`completed` は削除不可、修正は manager のみ |

### D. API境界

#### 採用: Server Actions 主導 + CSV のみ Route Handler

残業申請と同じ方針。認可は既存の `getSession()` / `requireSession()` / `requireManager()` を流用する。**新規 PIN 認証や Cookie 発行は不要**（既にログインセッションがある）。

| ファイル / エンドポイント | 種別 | 用途 | 認可 |
|---|---|---|---|
| `app/vehicle/actions.ts: assignVehicle` | Server Action | 当日割当 | `requireSession` (member以上) |
| `app/vehicle/actions.ts: releaseAssignment` | Server Action | 割当解除 | 本人 or manager |
| `app/vehicle/actions.ts: startDriving` | Server Action | 出発登録 | 本人（割当ありの車両のみ） |
| `app/vehicle/actions.ts: finishDriving` | Server Action | 帰着登録 | 本人 or manager |
| `app/vehicle/actions.ts: cancelDriving` | Server Action | 走行ログ削除 | 本人 (5分以内 + `in_progress`) |
| `app/vehicle/actions.ts: createRefueling` | Server Action | 給油登録 | `requireSession` |
| `app/admin/settings/vehicle/actions.ts: upsertVehicle` | Server Action | 車両追加・編集 | `requireManager` |
| `app/admin/settings/vehicle/actions.ts: deactivateVehicle` | Server Action | 車両無効化 | `requireManager` |
| `GET /api/admin/vehicle/driving.csv?ym=YYYY-MM` | Route Handler | 走行CSV | manager セッション必須 |
| `GET /api/admin/vehicle/refueling.csv?ym=YYYY-MM` | Route Handler | 給油CSV | manager セッション必須 |

**Server Action のシグネチャ（残業申請パターン踏襲）**:

```ts
// app/vehicle/actions.ts
"use server";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; errors: ValidationErrors; formError?: string };

export async function assignVehicle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult>;
// FormData fields: { vehicleId: string }
// 副作用: 同一 user の active 割当があれば自動 release
// 完了時: redirect(`/vehicle?assigned=${vehicleId}`)
// revalidatePath: "/vehicle", "/admin/vehicle"

export async function startDriving(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult>;
// FormData fields: { vehicleId, startOdometer, purpose, workSiteName, workSiteId? }
// 完了時: redirect(`/vehicle/driving/${id}`)
// revalidatePath: "/vehicle", "/admin/vehicle"

export async function finishDriving(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult>;
// FormData fields: { drivingLogId, endOdometer }
// 完了時: redirect(`/vehicle?completed=${id}`)
// revalidatePath: "/vehicle", "/vehicle/history", "/admin/vehicle"

export async function cancelDriving(formData: FormData): Promise<void>;
// FormData fields: { drivingLogId }
// ガード: 本人 && status="in_progress" && createdAt が5分以内

export async function createRefueling(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult>;
// FormData fields: { vehicleId, refuelDate, liters, amountJpy, stationName, note? }
```

**Route Handler レスポンス**:

```ts
// GET /api/admin/vehicle/driving.csv?ym=2026-05
// Response: text/csv; charset=utf-8 + BOM、Content-Disposition: attachment
// 月境界: JST [YYYY-MM-01 00:00, 翌月-01 00:00) を workDate で抽出
// 認可失敗時: 401 "unauthorized"
```

### E. バリデーション規約（`lib/vehicle.ts` に集約）

残業申請の `lib/overtime.ts` と同じ構造で `lib/vehicle.ts` を新設する:

```ts
// lib/vehicle.ts (型と関数のシグネチャのみ。実装は実装担当者)

export const DRIVING_STATUSES = ["in_progress", "completed"] as const;
export type DrivingStatus = (typeof DRIVING_STATUSES)[number];
export function assertDrivingStatus(value: string): DrivingStatus;

export const STATUS_LABEL: Record<DrivingStatus, string> = {
  in_progress: "進行中",
  completed: "完了",
};

export const VEHICLE_PLATE_MAX_CHARS = 30;
export const VEHICLE_MODEL_MAX_CHARS = 30;
export const PURPOSE_MAX_CHARS = 50;
export const STATION_NAME_MAX_CHARS = 50;
export const REFUELING_NOTE_MAX_CHARS = 50;
export const ODOMETER_MAX = 9_999_999;  // 7桁メーター上限
export const LITERS_MAX = 500;          // 1回給油500L上限（バス・トラック想定でも余裕）
export const AMOUNT_JPY_MAX = 500_000;

export type ValidationErrors = Record<string, string>;

// 出発登録
export type StartDrivingInput = {
  vehicleId: string;
  startOdometer: string;  // 文字列で受けて数値化
  purpose: string;
  workSiteName: string;
  workSiteId: string | null;
};
export type ValidatedStartDrivingInput = {
  vehicleId: string;
  startAt: Date;           // サーバ側 new Date() 採用
  startOdometer: number;
  purpose: string;
  workSiteName: string;    // .trim().normalize("NFKC")
  workSiteId: string | null;
};
export function validateStartDrivingInput(
  input: StartDrivingInput,
): { ok: true; value: ValidatedStartDrivingInput } | { ok: false; errors: ValidationErrors };

// 帰着登録
export type FinishDrivingInput = {
  drivingLogId: string;
  endOdometer: string;
};
export type ValidatedFinishDrivingInput = {
  drivingLogId: string;
  endAt: Date;
  endOdometer: number;
};
// 注意: startOdometer との比較はバリデーション関数内では行わない（DB読み出しが必要なため、actions.ts 側で実施）
export function validateFinishDrivingInput(
  input: FinishDrivingInput,
): { ok: true; value: ValidatedFinishDrivingInput } | { ok: false; errors: ValidationErrors };

// 給油
export type CreateRefuelingInput = {
  vehicleId: string;
  refuelDate: string;       // "YYYY-MM-DD"
  liters: string;           // 文字列で受けて parseFloat
  amountJpy: string;
  stationName: string;
  note: string;
};
export function validateCreateRefuelingInput(
  input: CreateRefuelingInput,
  now?: Date,
): { ok: true; value: ValidatedCreateRefuelingInput } | { ok: false; errors: ValidationErrors };

// 集計
export type MonthlyVehicleRow = {
  vehicleId: string;
  plate: string;
  model: string;
  totalDistanceKm: number;
  drivingCount: number;
  totalRefuelLiters: number;
  totalRefuelJpy: number;
  kmPerLiter: number | null;  // 燃費。給油0Lなら null
};

export function buildMonthlyVehicleRows(args: {
  vehicles: Vehicle[];
  drivingLogs: DrivingLog[];
  refuelingLogs: RefuelingLog[];
  monthStart: Date;
  monthEnd: Date;
}): MonthlyVehicleRow[];

export type MonthlyUserDrivingRow = {
  userId: string;
  userName: string;
  totalDistanceKm: number;
  drivingCount: number;
};

export function buildMonthlyUserDrivingRows(args: {
  users: User[];
  drivingLogs: DrivingLog[];
  monthStart: Date;
  monthEnd: Date;
}): MonthlyUserDrivingRow[];

// 点検期限警告
export function inspectionsDueWithin(args: {
  vehicles: Vehicle[];
  windowDays: number;       // 30
  now?: Date;
}): { vehicle: Vehicle; daysLeft: number }[];
```

`workDate` の生成は残業申請と同じ `startOfDateJST(new Date("YYYY-MM-DDT00:00:00+09:00"))` 形式。

### F. 処理フロー（割当→出発→帰着）

```
1. /vehicle にアクセス
   - requireSession()
   - 当日(JST) の自分の active 割当を取得
   - 当日 active 割当を持つ全車両を取得（他人の使用状況も見せる）
   - 当日 active 割当のない車両（割当可能）を取得

2. 「車両Aを使う」をタップ → assignVehicle({ vehicleId: A })
   - 既存 active 割当（同一 user、releasedAt=NULL）があれば
       updateMany({ where: { userId, releasedAt: null }, data: { releasedAt: now } })
       → これで前回割当を自動release
   - VehicleAssignment.create({ vehicleId, userId, assignDate: 今日JST 0時, releasedAt: null })
   - revalidatePath("/vehicle"), revalidatePath("/admin/vehicle")
   - redirect("/vehicle?assigned=A")

3. 「出発を登録」→ /vehicle/driving/start
   - 入力フォーム: startOdometer, purpose, workSite（既存 datalist サジェスト）
   - submit → startDriving({ vehicleId, ... })
     - 当該 vehicle の active 割当が自分のものか検証
     - 当日 in_progress な走行ログが既にある場合は警告（送信はブロックしない、フォームで「未帰着あり」表示）
     - DrivingLog.create({ ..., status: "in_progress" })
     - redirect("/vehicle/driving/[id]")

4. 帰着 → /vehicle/driving/[id] で endOdometer 入力 → finishDriving
   - DrivingLog 取得、status="in_progress" を確認
   - endOdometer >= startOdometer を検証
   - updateMany({ where: { id, status: "in_progress" }, data: { endAt: now, endOdometer, distanceKm, status: "completed" } })
   - count === 0 なら 409 相当（フォームエラー「他の操作で更新されています」）
   - redirect("/vehicle?completed=1")
```

### G. UIパターン（既存 `.ot-*` を踏襲して `.vh-*` を新設）

ui-designer への brief 用に既存命名規則を踏襲する形で整理する:

| 用途 | 既存(残業) | 新規(車両) |
|---|---|---|
| ボタン primary 大 | `.ot-btn-primary.ot-btn-lg.ot-btn-block` | 同上を**そのまま流用**（汎用化済） |
| バッジ - 進行中 | `.badge.ot-badge-submitted` | `.badge.vh-badge-in-progress` |
| バッジ - 完了 | `.badge.ot-badge-approved` | `.badge.vh-badge-completed` |
| バナー - 警告 | `.ot-banner.ot-banner-warn` | 同上を流用 |
| 入力 | `.ot-input` | 流用 |
| カード | `.card` | 流用 |
| 履歴行 | `.ot-history-row` | `.vh-history-row`（残業のレイアウトと違うので別名） |
| toast | `.ot-toast` | 流用 |

新規 CSS は `app/globals.css` の末尾に追記、既存トークン (`--primary`/`--warn`/`--surface` 等) のみ使用。新色は出さない。

**画面上の重要パターン**:
- 車両カード（割当可能一覧）: plate（大文字・太字） + model + depot + 「使う」ボタン
- 進行中走行カード: vehicle plate + 開始時刻 + 行先 + 「帰着を登録」ボタン
- 点検期限アラート: 残業の `ot-banner-pending` と同じ構造、`残り N 日`表示

### H. CSV仕様

**走行明細 CSV** (`/api/admin/vehicle/driving.csv?ym=2026-05`)

- ファイル名: `driving_<YYYY-MM>.csv`
- 文字コード: UTF-8 BOM付き / 改行 CRLF / カンマ区切り（`lib/csv.ts` の `serializeCsv` + `csvResponseHeaders` を流用）
- 月境界: JST `[YYYY-MM-01 00:00, 翌月-01 00:00)` を `workDate` 基準
- ステータス: デフォルト `completed` のみ、`?status=all` で `in_progress` 含む全件

| 列 | 値 | 型 | 例 |
|---|---|---|---|
| ログID | `id` | string | `clx...` |
| 業務日 | `workDate` (JST `YYYY-MM-DD`) | string | `2026-05-12` |
| 運転者 | `user.name` | string | `田中 太郎` |
| 車両番号 | `vehicle.plate` | string | `宮城500あ12-34` |
| 車種 | `vehicle.model` | string | `ハイエース` |
| 目的 | `purpose` | string | `据付` |
| 現場名 | `workSiteName` | string | `仙台市青葉区○○ビル` |
| 出発時刻 | `startAt` (JST `HH:mm`) | string | `08:15` |
| 帰着時刻 | `endAt` (JST `HH:mm`、未帰着 `""`) | string | `17:42` |
| 出発メーター | `startOdometer` | int | `48201` |
| 帰着メーター | `endOdometer` | int | `48267` |
| 走行距離(km) | `distanceKm` | int | `66` |
| 状態 | `status` (日本語化) | string | `完了` |

**給油明細 CSV** (`/api/admin/vehicle/refueling.csv?ym=2026-05`)

| 列 | 値 | 例 |
|---|---|---|
| ログID | `id` | `clx...` |
| 給油日 | `refuelDate` (JST `YYYY-MM-DD`) | `2026-05-08` |
| 運転者 | `user.name` | `佐藤 花子` |
| 車両番号 | `vehicle.plate` | `宮城500あ12-34` |
| 給油量(L) | `liters` | `42.5` |
| 金額(円) | `amountJpy` | `7480` |
| 単価(円/L) | `amountJpy / liters` 切り捨て1の位 | `176` |
| 給油所 | `stationName` | `ENEOS 仙台○○SS` |
| メモ | `note` | `""` |

### I. 既存機能との接続点

| 観点 | 接続内容 |
|---|---|
| `lib/session.ts` | `getSession()` / `requireSession()` / `requireManager()` をそのまま使用 |
| `WorkSite` マスタ | `DrivingLog.workSiteId` で再利用。残業申請と完全共有（現場マスタを一元化） |
| `proxy.ts` | 既存ルール (`/admin/*` は manager) で自動的にガードされる。`PUBLIC_API_PREFIXES` 追加は**不要** |
| `lib/csv.ts` | `serializeCsv` / `csvResponseHeaders` を流用、新規追加なし |
| `lib/time.ts` | `startOfTodayJST` / `startOfMonthJST` / `endOfMonthJST` / `parseYmdJST` / `formatJSTYmd` / `formatJSTHHmm` を流用。**新規関数追加なし** |
| `AppHeader` コンポーネント | 既存 `app/_components/AppHeader.tsx` をそのまま使う |
| `/admin` トップ | 既存の残業未承認バナーと同様、進行中走行件数 / 点検期限切れ近い車両のリンクカードを追加（実装担当向け1行タスク） |

### J. マイグレーション戦略（Turso本番への流し込み）

残業申請（Phase 0→Phase 1）と同じ手順を踏む。dev は `prisma migrate dev`、本番(Turso)は `prisma migrate deploy` または手動 ALTER。

```
ローカル:
1. prisma/schema.prisma を追記
2. npx prisma migrate dev --name add-vehicle-management
   → prisma/migrations/<timestamp>_add_vehicle_management/migration.sql 生成
3. npx prisma generate
4. npm run seed で Vehicle 3-5台、サンプル走行/給油ログを投入
5. npm run dev で動作確認

本番(Turso):
6. migration.sql の中身を読み、ALTER系のみ抽出
7. turso db shell <db-name> < migration.sql で適用
   - もしくは prisma migrate deploy が動くなら自動適用
8. 適用後に SELECT count(*) FROM Vehicle で確認
9. 本番に車両マスタを手動 INSERT（ニナウ社の実車両番号、デモ前に要ヒアリング）
```

**注意**:
- 既存テーブルへの破壊的変更がないため `--create-only` は不要、通常の `migrate dev` でOK
- `User` モデルへの `@relation` 追加は SQLite的にはスキーマ上のみで実DDLを生成しない（外部キーは子テーブル側）。マイグレーション結果はSQLで確認すること
- Turso の libsql は Prisma 6 の `driverAdapters` 経由のため、`migrate deploy` 動作実績はプロジェクト直下の `HANDOFF.md` を必ず確認（過去にハマっている可能性大）

### K. seed (`prisma/seed.ts` 拡張)

```
- Vehicle 4台
  - ハイエース 宮城500あ12-34 / 仙台営業所 / 点検期限2026-08-15
  - ハイエース 宮城500あ56-78 / 仙台営業所 / 点検期限2026-06-01（→ 30日以内警告対象）
  - キャラバン 宮城500い90-12 / 名取出張所 / 点検期限2026-12-20
  - 軽トラ 宮城480あ34-56 / 仙台営業所 / 点検期限なし

- VehicleAssignment 2件（当日割当、member 2名分）
- DrivingLog 3件
  - 1件: in_progress（帰着待ち）
  - 2件: completed（午前/午後）
- RefuelingLog 2件（過去5日内）
```

manager / member の seed は既存通り（ニナウ社員14名）。

---

## 却下案と理由

### 割当モデル

| 案 | 概要 | 採用判定 | 却下/採用理由 |
|---|---|---|---|
| **A. VehicleAssignment テーブル方式（採用）** | 1日1行 + releasedAt で履歴保持 | **採用** | 過去誰が乗っていたかを必ず追える。1人1日1台の論理制約をアプリ層で取りやすい |
| B. Vehicle に `currentUserId` を直接持つ | 「今誰が使っているか」だけを保持 | 却下 | 過去履歴が消える。月次レポート不可能 |
| C. DrivingLog だけで割当を表現（テーブル分離なし） | 走行ログがあれば暗黙的に割当中 | 却下 | 「割り当てたが今日まだ走っていない」状態を表現できない（朝の予約 → 午後出発のユースケース） |
| D. 時刻単位の予約（10:00-12:00 など） | 1台を午前/午後で別人が使うシナリオ | 却下 | デモのスコープを超える複雑度。空調設備業のヒアリングで「1日1台基本」と仮定 |

### 走行ログのモデル

| 案 | 概要 | 採用判定 | 却下/採用理由 |
|---|---|---|---|
| **A. 1ログ = 1走行（出発〜帰着）（採用）** | 中継現場ごとに分けず、その日の運行を1行で持つ | **採用** | 入力負荷が低い。空調設備の業務実態（朝〜夕方の長距離移動の合間に複数現場 → 申告は実質1運行）と合う |
| B. 1ログ = 1セグメント（現場ごとに分ける） | 複数現場訪問を厳密に記録 | 却下 | スマホ入力負荷が大きすぎる。法令要件もない |
| C. 出発と帰着で2レコード作る（残業申請の事前/事後ペアと同じ思想） | DrivingLogStart / DrivingLogEnd を別行 | 却下 | クエリ複雑化。1行 + nullable で十分 |

### 状態管理

| 却下案 | 理由 |
|---|---|
| `in_progress` を boolean (`isCompleted`) で持つ | 残業申請の `status` 文字列パターンと一貫性を欠く。将来 `cancelled` を増やしたい時に困る |
| `endOdometer` が NULL = 進行中、として `status` カラム廃止 | クエリで `WHERE status = "in_progress"` が書けない（NULL比較の取り回し）。インデックスも貼りにくい |
| 進行中走行の自動キャンセル（夜23:59に in_progress → cancelled） | デモのスコープ越え。Cronなし。manager が手動で「帰着登録代行」する運用で十分 |

### 認可

| 却下案 | 理由 |
|---|---|
| 残業申請と同じ4桁PIN を追加 | 既にログインセッションがあるので不要。冗長 |
| 車両ごとの「使用許可ユーザー」リスト | デモのスコープ越え、現場運用と乖離 |
| 全員 manager 扱いで車両マスタも編集可 | デモでも「マスタ管理は管理者だけ」が映える。`requireManager` でガード |

### API境界

| 却下案 | 理由 |
|---|---|
| 全部 Route Handler (`/api/vehicle/*`) | フォーム楽観UIで `useActionState` + Server Actions が圧倒的に書きやすい（残業申請と同じ判断） |
| 全部 Server Actions（CSVも含む） | バイナリ/ストリームレスポンスがServer Actionsでは扱いにくい |
| tRPC | デモ規模に対しオーバーキル |

### フォーム構成

| 却下案 | 理由 |
|---|---|
| 出発と帰着を1フォームで一括入力 | 帰着時刻はリアルタイムが価値、後追い一括は実態と離れる |
| 走行記録は「現場×訪問×時刻」を都度追加（複数行入力） | 入力負荷高すぎ。1運行1行で十分 |
| 給油記録を走行ログに紐付け（毎走行末尾に給油オプション） | 給油は独立イベント。日付・車両だけで紐付くテーブル分離が素直 |

---

## 失敗モードと対策

| # | 失敗モード | 検知 | 対策 |
|---|---|---|---|
| 1 | 同一車両×同一日に複数 active 割当が並走（クリック連打） | アプリ層で防御 | 割当作成時に `updateMany({ where: { vehicleId, assignDate: 今日, releasedAt: null }, data: {...} })` を**先に**実行し、衝突を解消してから create。SQLiteなのでDB一意制約は使えない |
| 2 | 同一user×同一日に複数 active 割当 | 同上 | `updateMany({ where: { userId, releasedAt: null }, data: { releasedAt: now } })` を割当作成前に必ず通す（前回割当の自動解除） |
| 3 | startOdometer < 前回 completed の endOdometer（メーター戻り） | サーバ側で同車両の最新 completed の endOdometer を取得して比較 | 警告のみ（送信は許可）。実車のメーター故障・読み間違いを許容するが UI で `⚠ 前回より少ない` 表示 |
| 4 | endOdometer < startOdometer（同一ログ内のメーター矛盾） | バリデーション必須 | エラーで送信拒否 |
| 5 | endOdometer >> startOdometer（誤入力で1000kmなど） | 異常検知 | distanceKm > 500km なら warning フラグ。送信は許可、UIで「異常に長い走行距離」表示 |
| 6 | 進行中走行が複数並走 | サーバ側集計時にも、UI側にも露出 | フォーム表示時に同一userの `in_progress` 件数を出す。送信前確認ステップ |
| 7 | 帰着登録忘れ（永遠に in_progress） | 翌朝に manager が見て気付く | `/admin/vehicle` トップに「進行中（未帰着）一覧」を常時表示、24h以上経過は警告色 |
| 8 | 給油の単価異常（liters=0、amountJpy=0 等） | バリデーション | liters > 0、amountJpy > 0 必須。amountJpy/liters > 300円/L は warning |
| 9 | 点検期限切れの車両を継続使用 | 期限切れ車両は割当時に警告（ブロックしない） | UIで `⚠ 点検期限超過` 表示。manager は `/admin/settings/vehicle` で期限更新可能 |
| 10 | 複数日にまたがる走行（夜出発・翌朝帰着） | `workDate` をどちらにするか | **workDate = startAt の JST 日付**で固定（運行管理の慣習）。endAt が翌日になるのは許容（残業の30hまでルールと同じ） |
| 11 | manager が代理で他人の走行ログを編集 | スコープ外（デモ範囲） | 編集は完了済ログ含めて本人のみ。manager は閲覧のみ。「将来要件として未対応」と未解決事項に明記 |
| 12 | 退職した user の過去ログ参照 | 既存 `User.isActive=false` 運用に従う | 物理削除しない。`vehicleAssignments` リレーション残置、表示は氏名そのまま |
| 13 | 車両無効化後に当日割当が残る | `Vehicle.isActive=false` 時の挙動 | `deactivateVehicle` 時に当該車両の active 割当を自動 release。`isActive=false` の車両は割当画面に出さない、ただし過去ログには表示される |
| 14 | CSV の現場名・目的に改行/カンマ混入 | `lib/csv.ts: escapeCell` が処理 | テスト済 |
| 15 | UTF-8 BOM忘れ | Excel文字化け | `serializeCsv` が BOM 付与済 |
| 16 | `workDate` をUTC扱いしてしまう | 月境界で前月にズレる | `lib/time.ts` の `startOfMonthJST` / `endOfMonthJST` を使う（残業申請と同じ） |
| 17 | Tursoのリードレプリカ遅延で割当直後に「割当なし」表示 | 既存パターン | `revalidatePath` + `redirect` で必ずサーバー側再フェッチさせる（残業申請と同じ作法） |
| 18 | 走行中の vehicleId 変更（割当ミス） | 進行中ログがある状態で割当変更 | 割当解除時に進行中ログがあれば警告。release 自体は許可、走行ログは紐付いたまま残る |
| 19 | 給油車両と走行車両の不一致（給油記録の vehicleId 誤選択） | バリデーション軽い | UIで「自分が今日割当中の車両」を初期値にする。他車両への給油記録も許可（代理給油） |
| 20 | 大量の点検期限超過アラートで UI が埋まる | 警告閾値 | `/admin/vehicle` の警告セクションは最大5台まで、超過は「他 N 台」とする |

---

## 実装順序

依存の薄い順、早期検証可能な順。残業申請と同じ Phase 区切り（A: モデル+seed+一覧 / B: 登録/編集 / C: 管理画面・レポート・CSV）。

### Phase A: モデル + seed + 一覧（manager が「車両があること」を確認できる）

| # | タスク | 概算行数 | 依存 |
|---|---|---|---|
| 1 | `prisma/schema.prisma` 拡張（Vehicle / VehicleAssignment / DrivingLog / RefuelingLog 追加 + User/WorkSite に relation 追加） | +90行 | - |
| 2 | `prisma/migrations/<ts>_add_vehicle_management/migration.sql` 生成 + `prisma generate` | 自動 | 1 |
| 3 | `prisma/seed.ts` に Vehicle 4台 + サンプル割当2件 + サンプル走行3件 + サンプル給油2件 追加 | +80行 | 1 |
| 4 | `lib/vehicle.ts` 新設: 型定義 / バリデーション / 集計関数 / 点検期限警告 | +220行 | 1 |
| 5 | `/vehicle` member 向けトップ（当日割当 + 割当可能車両一覧 + 履歴3件） | +180行 | 4 |
| 6 | `/admin/vehicle` manager 向けダッシュボード（割当一覧 + 進行中 + 点検期限アラート） | +200行 | 4 |

### Phase B: 登録 / 編集（フローが回る）

| # | タスク | 概算行数 | 依存 |
|---|---|---|---|
| 7 | `app/vehicle/actions.ts` 新設: assignVehicle / releaseAssignment / startDriving / finishDriving / cancelDriving / createRefueling | +200行 | 4 |
| 8 | `/vehicle/assign` 確認画面 + Server Action 呼び出し | +60行 | 7 |
| 9 | `/vehicle/driving/start` 出発登録フォーム | +180行 | 7 |
| 10 | `/vehicle/driving/[id]` 進行中詳細 + 帰着登録 | +150行 | 7 |
| 11 | `/vehicle/refueling/new` 給油登録フォーム | +130行 | 7 |
| 12 | `/vehicle/history` 自分の履歴 | +120行 | 4 |

### Phase C: 管理画面・レポート・CSV

| # | タスク | 概算行数 | 依存 |
|---|---|---|---|
| 13 | `/admin/settings/vehicle/page.tsx` + `actions.ts` 車両マスタ追加・無効化・点検期限更新 | +180行 | 4 |
| 14 | `/admin/vehicle/report/page.tsx` 月次レポート（車両別・社員別） | +220行 | 4 |
| 15 | `/api/admin/vehicle/driving/route.ts` 走行CSV | +90行 | 4 |
| 16 | `/api/admin/vehicle/refueling/route.ts` 給油CSV | +60行 | 4 |
| 17 | `/admin` トップに「進行中走行 N件 / 点検期限切迫 N台」リンクカード追加 | +30行 | 6 |
| 18 | `app/globals.css` に `.vh-*` スタイル追記（既存トークン組合せのみ） | +140行 | - |
| 19 | E2E動作確認: seed → 割当 → 出発 → 帰着 → 給油 → 月次CSV出力 | - | 全て |

**合計概算**: フロント 約1,240行 / バック・lib 約510行 / Prisma 約90行 / seed 約80行 / CSS 約140行 = **約2,060行**。

**マイルストーン**:
- M1（3完了）: スキーマ確定・seed投入できる
- M2（4完了）: lib層の単体テストが通る
- M3（5-6完了）: 一覧画面でデータが見える（demo可能ライン α）
- M4（7-12完了）: 申請者側の登録フローが回る（demo可能ライン β）
- M5（13-17完了）: 管理画面・月次レポートまで完成（demo フル機能）
- M6（18-19完了）: 仕上げ・全体動作確認

**並行化の余地**:
- Phase B の 9 / 10 / 11 はそれぞれ独立フォーム、ui-designer に**順番に**投げる（同時実行はサブエージェント規約で禁止）
- Phase C の 15 / 16 は独立、4 と 6 完了後に並行作業可能（ui-designer 不要、Main Claude or 別エージェント）

---

## 未解決事項

1. **車両番号フォーマットの正規化**: `"宮城500あ12-34"` の全角/半角・スペースの揺れ。`.normalize("NFKC")` で十分か、ハイフン位置の統一まで強制するか
2. **燃費(km/L)の有意義性**: 給油タイミングと走行タイミングのズレで月単位の燃費は信頼性が低い。「直近満タン法」を実装するかは researcher 案件
3. **複数日割当**: 出張で2-3日連続同じ車両を使うとき、毎朝割当をし直すのは面倒。`assignDate` を範囲化するか、自動で前日割当を翌日に延長するかは要相談
4. **退職時の処理**: User の `isActive=false` 化したとき、過去の `DrivingLog` 表示はそのまま、ただし `/admin/vehicle` の「今日の割当」には active な userId のみ出すべきか
5. **写真添付**: 給油のレシート画像をアップロードしたい要望が出る可能性高（経理用途）。スコープ外と明示。将来は `RefuelingLog.receiptUrl` 追加で対応可能
6. **走行ログの「目的」マスタ化**: `purpose` を `WorkSite` 同様の `Purpose` マスタにするかは将来要件。デモは自由記述で十分
7. **点検期限の通知方法**: メール通知・LINE通知はスコープ外、画面表示のみ。営業デモで「通知できますか？」と聞かれた時の答え（researcher 案件）

---

## 実装担当者への申し送り

- AGENTS.md の通り、書く前に `node_modules/next/dist/docs/` を読むこと。Next.js 16 のServer Actions / Route Handlers / `cookies()` API は本設計書記載と挙動が違う可能性がある。**設計書ではなくドキュメントを正とする**
- 既存の `app/overtime/actions.ts` と `lib/overtime.ts` を**手本**にする。型シグネチャ・revalidatePath の対象・redirect のクエリパラメータ規約まで揃える
- Tailwind禁止。`app/globals.css` の既存トークンを組み合わせる。新色を入れたい時は architect に相談
- UI実装は ui-designer に委譲する（Main Claudeは書かない）。ブリーフには本設計書 §G を抜粋して渡すこと
- マイグレーション後、`prisma/dev.db` を削除して `npx prisma migrate dev` + `npm run seed` で再構築可能なことを必ず確認
- proxy.ts の PUBLIC_API_PREFIXES への追加は**不要**（CSV含め全てログインセッション必須）
