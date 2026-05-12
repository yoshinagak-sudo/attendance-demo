# 日報機能 設計書

最終更新: 2026-05-12
担当: architect
対象: butaifarm-attendance/web/

---

## 背景と目的

ニナウ社（仙台空調設備）向け勤怠デモアプリに「日報機能」を追加する。同社は社員14名のうち member 8名が現場直行で空調設備の据付・保守を回り、夕方〜夜に当日業務の報告を行う運用。営業デモで「打刻＋残業申請＋日報が同じ画面で完結する」「現場名・工数・申し送りが月次で蓄積され、稼働分析にそのまま使える」を見せ、紙日報・Excel日報からの脱却シナリオを描く。

**前提（重要・誤解しやすい）**:
- 本番運用ではなくデモ用途。建設業日報の法令準拠（安全衛生記録、KY活動記録）は本機能スコープ外、自由記述欄で代用。
- 既存スタック踏襲: Next.js 16（App Router + `proxy.ts`、`use server`）/ Prisma 6 / libsql(Turso) / plain CSS（`.ot-*` 命名規則の派生として `.dr-*` を新設）/ React 19。新ライブラリ・新スタイル体系は導入しない。
- 認証は既存 `lib/session.ts` の `member` / `manager` を流用。**新規ロール追加禁止**（CLAUDE.md指示）。
- 日付/時刻は `lib/time.ts` の JST helpers を必ず使う。`new Date()` を画面で直接整形しない。
- **実装担当者は `node_modules/next/dist/docs/` を読むこと**（AGENTS.md指示）。Server Actions/Route Handlers の API は本設計書ではなくそちらを正とする。

---

## スコープ

### 含むもの

| ID | 内容 |
|---|---|
| S-1 | 当日業務内容の入力（複数の作業アイテムを時刻つきで記載できる） |
| S-2 | 各作業アイテムに訪問先現場（既存 `WorkSite` マスタを流用）と工数（時間入力）を持たせる |
| S-3 | 1日1ユーザーあたり1日報を基本とする（同日複数提出はマージ／上書き運用） |
| S-4 | 進捗・トラブル・申し送りの自由記述欄（合計600文字） |
| S-5 | 工数の表現は「時間入力（分単位）」のみ。％ 配分案は却下（理由 §「却下案」） |
| S-6 | 提出ステータス: `draft` / `submitted` / `acknowledged`（manager 確認済） |
| S-7 | スマホで member が登録、自動保存（5秒debounce）で下書きが落ちないこと |
| S-8 | manager は部下の日報一覧確認、CSV 出力（明細レベル） |
| S-9 | `/admin/report` で月次サマリ（社員別・現場別の工数合計）を確認できる |

### 含まないもの（非スコープ）

| ID | 内容 | 理由 |
|---|---|---|
| NS-1 | 日報の承認フロー（差戻・再提出） | デモのスコープ過大。`acknowledged` で「確認済」マークまで |
| NS-2 | 画像添付（現場写真） | スコープ外（researcher 案件）。後続 `DailyReportItem.photoUrls Json?` 追加で対応可 |
| NS-3 | 工数の自動算出（打刻と現場連動） | 残業申請のプリフィルと同じレベルの推定は実装するが、自動確定はしない |
| NS-4 | 個別現場の安全衛生報告（KY 活動・ヒヤリハット） | 自由記述欄で代用、スコープ外 |
| NS-5 | 過去日の遡及作成・編集 | manager のみ7日前まで遡及作成可。member は当日のみ |
| NS-6 | 日報の他社員代理作成 | manager は閲覧のみ。代理作成は将来要件 |

---

## 要件

### 機能要件

| ID | 要件 |
|---|---|
| F-1 | 申請者は当日(JST)の日報を作成・編集できる |
| F-2 | 1日報につき複数の作業アイテムを追加・削除できる（最大10件） |
| F-3 | 作業アイテムには「開始時刻」「終了時刻」「現場名」「作業内容（80文字）」「工数(分)」を持たせる |
| F-4 | 工数は分単位の整数で保存。表示は `h:mm` 形式 |
| F-5 | 工数の合計値を日報全体としてサーバ計算・保存（CSV 出力の集計を高速化） |
| F-6 | 自由記述欄は「進捗・トラブル・申し送り」を1欄600文字（後で分割するなら拡張） |
| F-7 | 状態遷移: `draft → submitted → acknowledged`、`submitted → draft`（取り下げ） |
| F-8 | 提出時刻はサーバで `submittedAt` に記録、確認時刻は `acknowledgedAt` に記録 |
| F-9 | manager は部下全員の日報を「日付一覧」「ユーザー別月次」で閲覧できる |
| F-10 | manager は日報を「確認済」マークできる（コメント任意） |
| F-11 | 月次CSV(UTF-8 BOM付き)に作業アイテム明細を出力（1日報=複数行） |
| F-12 | 同日の同一ユーザー再作成は upsert（既存日報の上書き、children 全削除→再生成） |

### 非機能要件

| ID | 要件 |
|---|---|
| NF-1 | スマホ単独運用想定。既存打刻・残業申請と同じデザイントークン |
| NF-2 | フォーム下書きはサーバ側 `draft` ステータスで保存（クライアントlocalStorageは使わない）。これにより別端末からの編集続行が可能 |
| NF-3 | SQLite/libsql制約: enum未対応 → 文字列+`assertXxx` 型ガード（残業申請と同じパターン） |
| NF-4 | 楽観ロック: 確認時 `where: { id, status: "submitted" }` で `updateMany` 競合検知 |
| NF-5 | proxy.ts の PUBLIC_API_PREFIXES の **追加は不要**（全てログイン必須） |
| NF-6 | 自動保存は debounce 5秒 + 明示「保存」ボタン併用。サーバ往復は `useTransition` でブロッキングしない |

---

## 採用案

### A. 画面構成

申請者側（member 含む全員）と管理者側（manager 限定）を `/admin` 配下で分ける既存パターンを踏襲。

- `/report` … member 向けエントリ。上部に「今日の日報」カード（draft / submitted / acknowledged のステータス）、下に自分の過去30日履歴
- `/report/today` … 今日の日報の作成・編集（1画面・自動保存）。submit ボタンで `draft → submitted`
- `/report/[id]` … 過去日報の詳細閲覧（自分のもの限定。manager は閲覧専用、確認アクション付き）
- `/admin/report` … 管理ダッシュボード（当日 / 直近7日の提出状況一覧、未確認件数バナー）
- `/admin/report/month` … 月次サマリ（社員別・現場別の工数合計 + CSV ダウンロード）
- `/admin/report/[id]` … 個別日報詳細（manager の確認アクション）

**遷移図（テキスト）**:

```
member: /report ──tap──▶ /report/today
            │              │
            │              ├── 作業アイテム追加 (+ボタン)
            │              ├── 自動保存 (5sec debounce) → status="draft"
            │              ├── 「提出する」 → status="submitted"
            │              └──▶ /report?submitted=1
            │
            └── 履歴行tap ──▶ /report/[id] (閲覧+取下げ)

manager: /admin ──link──▶ /admin/report
                              ├── 未確認件数バナー
                              ├── 当日提出者一覧
                              ├── 直近7日のヒートマップ
                              ├──▶ /admin/report/month (月次CSV)
                              └──▶ /admin/report/[id]
                                      └── 「確認済にする」ボタン
```

### B. データモデル（Prisma）

既存 `prisma/schema.prisma` の末尾に追加。既存モデルへの破壊的変更はしない。

```prisma
model DailyReport {
  id                String              @id @default(cuid())
  userId            String
  user              User                @relation("DailyReportUser", fields: [userId], references: [id])

  // 業務日（JST 0時のUTC表現。残業の workDate と同じ流儀）
  reportDate        DateTime

  // 自由記述（600文字上限。バリデーション側で制約）
  progressNote      String              @default("")   // 進捗・トラブル・申し送りを1欄に統合（YAGNI）

  // 工数合計（分単位、items 集計値のキャッシュ）
  totalMinutes      Int                 @default(0)

  // 状態（"draft" | "submitted" | "acknowledged"）
  status            String              @default("draft")

  // 提出・確認の監査情報
  submittedAt       DateTime?
  acknowledgedById  String?
  acknowledgedBy    User?               @relation("DailyReportAck", fields: [acknowledgedById], references: [id])
  acknowledgedAt    DateTime?
  ackComment        String?             // manager 任意コメント 200文字

  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  items             DailyReportItem[]

  // 1日1ユーザー1日報を論理保証（SQLiteで NULL混在の論理一意は取りにくいので、
  // reportDate も NOT NULL のため複合unique で対応）
  @@unique([userId, reportDate])
  @@index([reportDate])
  @@index([status, reportDate])
  @@index([userId, reportDate])
}

model DailyReportItem {
  id              String       @id @default(cuid())
  reportId        String
  report          DailyReport  @relation(fields: [reportId], references: [id], onDelete: Cascade)

  // 作業アイテム順序（UI上の並び順保持。0始まりの整数）
  orderIndex      Int          @default(0)

  // 時刻情報（DateTimeで保持、JST想定）
  startAt         DateTime
  endAt           DateTime
  durationMinutes Int                                       // (endAt - startAt) / 60000 をサーバで計算保存

  // 作業内容
  description     String                                     // 80文字上限
  workSiteName    String                                     // スナップショット保存（残業・車両と同じ流儀）
  workSiteId      String?
  workSite        WorkSite?    @relation("DailyReportItemSite", fields: [workSiteId], references: [id])

  createdAt       DateTime     @default(now())

  @@index([reportId, orderIndex])
  @@index([workSiteId])
}
```

`User` モデルに以下の relation を追加（既存フィールドは変更しない）:

```prisma
model User {
  // 既存フィールドは変更なし
  // 追加:
  dailyReports                  DailyReport[] @relation("DailyReportUser")
  dailyReportsAcknowledged      DailyReport[] @relation("DailyReportAck")
}
```

`WorkSite` モデルに以下の relation を追加:

```prisma
model WorkSite {
  // 既存フィールドは変更なし
  // 追加:
  dailyReportItems DailyReportItem[] @relation("DailyReportItemSite")
}
```

**設計判断のポイント**:

| 判断 | 理由 |
|---|---|
| `(userId, reportDate)` 複合unique | 1日1日報を論理保証。同日重複作成は upsert で吸収 |
| `DailyReportItem` を別テーブルに切り出す | 複数作業アイテムを構造化保持。CSV1行=1作業アイテムで出力しやすい |
| `items` を `onDelete: Cascade` | 日報削除時に明細が孤児にならない。draft 上書き時の差し替えも cascade 削除→再作成で実装 |
| `totalMinutes` を保存値として持つ（毎回 SUM ではなく） | 月次集計でN+1を防ぐ。`items` 更新時にサーバで再計算 |
| `progressNote` を1カラムに統合（trouble/handover 分離せず） | YAGNI。デモで「3つの自由記述欄」はUI複雑度が高い割に価値薄 |
| `orderIndex` を Int で持つ | 表示順保持。並び替えは upsert 時にクライアントから渡す順序通り再付番 |
| `workSiteName` スナップショット | マスタ改名で過去日報が書き換わるのを防ぐ（残業・車両と統一） |
| `status` 文字列+型ガード | SQLite制約。`lib/daily-report.ts` で Union 型と `assertReportStatus` を提供 |
| `acknowledgedById` / `acknowledgedBy` で manager を記録 | 「誰が確認したか」を必須で残す。デモで「ちゃんと感」が出る |

### C. 状態遷移

```
                +---------+
                | (none)  |
                +----+----+
                     | createOrUpdate (本人, 自動保存)
                     v
                +----+----+
                |  draft  | <----------------+
                +----+----+                  |
                     | submit (本人)         |
                     v                       |
                +----+----+                  |
                | submitted| --withdraw---+  |
                +----+----+               |  |
                     | acknowledge        |  |
                     | (manager)          |  |
                     v                    |  |
                +----+--------+           |  |
                | acknowledged|           |  |
                +-------------+           |  |
                                          v  |
                                       (本人による取り下げ)
                                          |
                                          +---→ draft に戻る
```

| 遷移 | 操作者 | 入力必須 | 制約 |
|---|---|---|---|
| `(none) → draft` | 本人 | 何もなくてOK（空 draft） | `reportDate=今日(JST)` のみ。manager は7日遡及可 |
| `draft → draft` | 本人 | 任意フィールド | 自動保存 5sec debounce |
| `draft → submitted` | 本人 | items 1件以上 | items 0件は提出不可 |
| `submitted → draft` | 本人 | - | acknowledged 後は不可 |
| `submitted → acknowledged` | manager | ackComment 任意 | 楽観ロック必須 |
| `acknowledged → draft` | manager のみ（誤確認の取消） | - | 「確認解除」アクションを manager に限定提供 |

**楽観ロックの実装**: `prisma.dailyReport.updateMany({ where: { id, status: "submitted" }, data: {...} })` で更新行数を確認（残業申請と同じパターン）。

### D. API境界

#### 採用: Server Actions 主導 + CSV のみ Route Handler

残業申請・車両管理と同じ方針。認可は既存の `getSession()` / `requireSession()` / `requireManager()` を流用、PIN 認証や Cookie 発行は不要。

| ファイル / エンドポイント | 種別 | 用途 | 認可 |
|---|---|---|---|
| `app/report/actions.ts: upsertReport` | Server Action | draft 自動保存 / 編集 | 本人のみ |
| `app/report/actions.ts: submitReport` | Server Action | draft → submitted | 本人のみ |
| `app/report/actions.ts: withdrawReport` | Server Action | submitted → draft | 本人のみ、acknowledged は不可 |
| `app/admin/report/actions.ts: acknowledgeReport` | Server Action | submitted → acknowledged | `requireManager` |
| `app/admin/report/actions.ts: unacknowledgeReport` | Server Action | acknowledged → draft | `requireManager` |
| `GET /api/admin/report/items.csv?ym=YYYY-MM` | Route Handler | 作業明細CSV | manager セッション必須 |

**Server Action のシグネチャ**:

```ts
// app/report/actions.ts
"use server";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; errors: ValidationErrors; formError?: string };

export type UpsertReportInput = {
  reportDate: string;        // "YYYY-MM-DD"
  progressNote: string;
  items: Array<{
    id?: string;             // 既存アイテムを再利用する場合のヒント（無くてもOK）
    orderIndex: number;
    startTime: string;       // "HH:mm" JST
    endTime: string;
    description: string;
    workSiteName: string;
    workSiteId: string | null;
  }>;
};

export async function upsertReport(
  _prev: ActionResult | null,
  formData: FormData,    // input は JSON 文字列で 'payload' フィールドに格納
): Promise<ActionResult>;
// 実装: items を全削除→再作成（cascade）で並び順問題を回避
// totalMinutes をサーバで再集計して保存
// revalidatePath: "/report", "/admin/report"

export async function submitReport(formData: FormData): Promise<void>;
// 制約: items 1件以上必要
// 完了時: redirect("/report?submitted=1")

export async function withdrawReport(formData: FormData): Promise<void>;
// 完了時: redirect("/report?withdrawn=1")
```

```ts
// app/admin/report/actions.ts
"use server";

export type ReviewActionResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

export async function acknowledgeReport(formData: FormData): Promise<void>;
// FormData fields: { id, ackComment? }
// 完了時: redirect("/admin/report?reviewed=1")

export async function unacknowledgeReport(formData: FormData): Promise<void>;
// FormData fields: { id }
// 制約: manager のみ
```

**Route Handler レスポンス**:

```ts
// GET /api/admin/report/items.csv?ym=2026-05
// Response: text/csv; charset=utf-8 + BOM、Content-Disposition: attachment
// 月境界: JST [YYYY-MM-01 00:00, 翌月-01 00:00) を reportDate で抽出
// status: デフォルト submitted+acknowledged、?status=all で draft 含む全件
// 認可失敗時: 401 "unauthorized"
```

### E. バリデーション規約（`lib/daily-report.ts` に集約）

残業申請の `lib/overtime.ts`、車両管理の `lib/vehicle.ts` と同じ構造で `lib/daily-report.ts` を新設する:

```ts
// lib/daily-report.ts (型と関数のシグネチャのみ。実装は実装担当者)

export const REPORT_STATUSES = ["draft", "submitted", "acknowledged"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export function assertReportStatus(value: string): ReportStatus;

export const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "下書き",
  submitted: "提出済",
  acknowledged: "確認済",
};

export const ITEM_DESCRIPTION_MAX_CHARS = 80;
export const PROGRESS_NOTE_MAX_CHARS = 600;
export const ACK_COMMENT_MAX_CHARS = 200;
export const ITEMS_MAX_COUNT = 10;
export const WORK_SITE_MAX_CHARS = 50;

export type ValidationErrors = Record<string, string>;

export type UpsertReportInput = {
  userId: string;
  reportDate: string;        // "YYYY-MM-DD"
  progressNote: string;
  items: Array<{
    orderIndex: number;
    startTime: string;       // "HH:mm" JST
    endTime: string;
    description: string;
    workSiteName: string;
    workSiteId: string | null;
  }>;
};

export type ValidatedReportItem = {
  orderIndex: number;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  description: string;
  workSiteName: string;       // .trim().normalize("NFKC")
  workSiteId: string | null;
};

export type ValidatedUpsertReportInput = {
  userId: string;
  reportDate: Date;           // JST 0時のUTC表現
  progressNote: string;
  items: ValidatedReportItem[];
  totalMinutes: number;
};

export function validateUpsertReportInput(
  input: UpsertReportInput,
  now?: Date,
): { ok: true; value: ValidatedUpsertReportInput } | { ok: false; errors: ValidationErrors };
// 注意点:
//   - items の各 startTime / endTime は parseHHmm + combineDateAndTimeJST で reportDate と結合
//   - 同一日報内の items の時間帯重複は警告のみ（休憩で抜けた時間も許容、ブロックしない）
//   - items が ITEMS_MAX_COUNT 超なら errors.items
//   - description / progressNote は codePointLength (絵文字対策、残業申請の流儀)

// 集計
export type MonthlySiteWorkRow = {
  workSiteName: string;
  totalMinutes: number;
  reportCount: number;        // 何件の日報で言及されたか
};

export function buildMonthlyBySite(args: {
  items: DailyReportItem[];
  monthStart: Date;
  monthEnd: Date;
}): MonthlySiteWorkRow[];

export type MonthlyUserWorkRow = {
  userId: string;
  userName: string;
  totalMinutes: number;
  reportedDays: number;       // 日報を出した日数
  submittedDays: number;      // submitted/acknowledged な日数
  acknowledgedDays: number;
};

export function buildMonthlyByUser(args: {
  users: User[];
  reports: DailyReport[];
  monthStart: Date;
  monthEnd: Date;
}): MonthlyUserWorkRow[];

// プリフィル（打刻からの推定）
export type DeriveReportDefaultsResult = {
  items: Array<{
    startTime: string;        // "HH:mm"
    endTime: string;
    description: string;      // "" デフォルト
    workSiteName: string;     // "" デフォルト
    workSiteId: null;
  }>;
  warnings: string[];
};

export function deriveReportDefaults(args: {
  reportDate: Date;
  records: TimeRecord[];
  now?: Date;
}): DeriveReportDefaultsResult;
// ロジック:
//   - 当日の TimeRecord を IN→OUT のセッションに変換 (lib/attendance.buildSessions と同方針)
//   - セッション1件 = 作業アイテム1件の雛形（時刻だけ埋まる）
//   - description / workSiteName は空（ユーザー入力前提）
//   - 打刻なし → items 0件、warning="no_clock_in"
```

`reportDate` の生成は残業申請・車両管理と同じ `startOfDateJST(new Date("YYYY-MM-DDT00:00:00+09:00"))` 形式。

### F. 処理フロー（作成→自動保存→提出→確認）

```
1. /report にアクセス
   - requireSession()
   - 当日(JST) の自分の DailyReport を取得（なければ「日報を作成する」ボタン）
   - 履歴30件取得

2. /report/today にアクセス
   - 当日 DailyReport が無ければ deriveReportDefaults で打刻ベースの items 雛形生成
   - DailyReport の status="draft" で空レコードを作成（最初の自動保存タイミングを待たずに作成）
   - フォーム表示

3. フォーム編集中
   - 5秒debounce で upsertReport(formData) を Server Action 経由で呼び出し
   - items[] の全件を JSON 化してFormDataの "payload" フィールドに乗せる
   - サーバ側: items を全削除→再作成（cascade）、totalMinutes 再計算
   - status は変えない (draft のまま)
   - revalidatePath("/report")

4. 「提出する」 → submitReport
   - status="draft" の DailyReport を status="submitted" に更新
   - submittedAt = now
   - 制約: items 1件以上、reportDate=今日
   - redirect("/report?submitted=1")

5. manager の確認 → /admin/report/[id]
   - acknowledgeReport(formData: { id, ackComment })
   - updateMany({ where: { id, status: "submitted" }, data: { status: "acknowledged", acknowledgedById, acknowledgedAt, ackComment } })
   - revalidatePath("/admin/report")
   - redirect("/admin/report?reviewed=1")
```

**重要パターン**:
- 自動保存は `useTransition` + `startTransition` で実行、UIブロックしない
- 自動保存中は画面右下に「保存中...」「保存しました HH:mm」表示（既存 `.ot-toast` を流用）
- 提出済の日報を本人が再編集したい場合は「取下げ → 編集 → 再提出」のフローを明示（差戻フローは入れない、§NS-1）

### G. UIパターン（既存 `.ot-*` / `.vh-*` を踏襲して `.dr-*` を新設）

ui-designer への brief 用に既存命名規則を踏襲する形で整理:

| 用途 | 既存(残業 / 車両) | 新規(日報) |
|---|---|---|
| ボタン primary 大 | `.ot-btn-primary.ot-btn-lg.ot-btn-block` | **流用** |
| バッジ - 下書き | `.badge.ot-badge-sent-back` 相当 | `.badge.dr-badge-draft` |
| バッジ - 提出済 | `.badge.ot-badge-submitted` 相当 | `.badge.dr-badge-submitted` |
| バッジ - 確認済 | `.badge.ot-badge-approved` 相当 | `.badge.dr-badge-acknowledged` |
| バナー - 警告 | `.ot-banner.ot-banner-warn` | **流用** |
| 入力 | `.ot-input` | **流用** |
| カード | `.card` | **流用** |
| 履歴行 | `.ot-history-row` | `.dr-history-row`（レイアウトが違うので別名） |
| toast | `.ot-toast` | **流用** |
| 作業アイテムカード（リスト編集UI） | （新規） | `.dr-item-card` |

新規 CSS は `app/globals.css` の末尾に追記、既存トークン (`--primary`/`--warn`/`--surface` 等) のみ使用。新色は出さない。

**画面上の重要パターン**:
- 作業アイテム編集は「カード + 追加ボタン (+)」のリスト形式。各カードは `.dr-item-card`、時刻 / 現場名 / 作業内容 / 工数 を縦並び（スマホ前提）
- 工数表示は `2:30` / `2時間30分` 両併記（タップでトグル）
- 自動保存表示: フォーム右下に固定 `.dr-autosave-status`
- progressNote は textarea で `rows={6}`、600文字カウンタ右下表示（580超で `--warn` 色）

### H. CSV仕様

**作業明細 CSV** (`/api/admin/report/items.csv?ym=2026-05`)

- ファイル名: `daily_report_items_<YYYY-MM>.csv`
- 文字コード: UTF-8 BOM付き / 改行 CRLF / カンマ区切り（`lib/csv.ts` の `serializeCsv` + `csvResponseHeaders` を流用）
- 月境界: JST `[YYYY-MM-01 00:00, 翌月-01 00:00)` を `reportDate` 基準
- 1行 = 1作業アイテム（1日報複数行）
- ステータス: デフォルト `submitted`+`acknowledged`、`?status=all` で `draft` 含む全件

| 列 | 値 | 型 | 例 |
|---|---|---|---|
| 日報ID | `report.id` | string | `clx...` |
| アイテムID | `item.id` | string | `clx...` |
| 業務日 | `reportDate` (JST `YYYY-MM-DD`) | string | `2026-05-12` |
| 申請者 | `user.name` | string | `田中 太郎` |
| 状態 | `status` (日本語化) | string | `確認済` |
| 順序 | `orderIndex` | int | `0` |
| 開始時刻 | `startAt` (JST `HH:mm`) | string | `08:30` |
| 終了時刻 | `endAt` (JST `HH:mm`) | string | `12:15` |
| 工数（分） | `durationMinutes` | int | `225` |
| 工数（h:mm） | `durationMinutes` 整形 | string | `3:45` |
| 現場名 | `workSiteName` | string | `仙台市青葉区○○ビル` |
| 作業内容 | `description` | string | `エアコン据付` |
| 進捗・申し送り | `report.progressNote`（同一日報の全アイテム行で重複表示） | string | `配管材不足、明日追加発注` |
| 提出時刻 | `submittedAt` (JST `YYYY-MM-DD HH:mm`) | string | `2026-05-12 18:42` |
| 確認者 | `acknowledgedBy.name` | string | `佐藤 花子` |
| 確認時刻 | `acknowledgedAt` (JST `YYYY-MM-DD HH:mm`) | string | `2026-05-13 09:15` |
| 確認コメント | `ackComment` | string | `""` |

**月次サマリ CSV (任意、`?aggregate=user` または `aggregate=site`)**: 別途追加の余地あり。Phase C で要否判断。

### I. 既存機能との接続点

| 観点 | 接続内容 |
|---|---|
| `lib/session.ts` | `getSession()` / `requireSession()` / `requireManager()` をそのまま使用 |
| `WorkSite` マスタ | `DailyReportItem.workSiteId` で再利用。残業申請・車両管理と完全共有（現場マスタの一元化を維持） |
| `proxy.ts` | 既存ルール (`/admin/*` は manager) で自動ガード。`PUBLIC_API_PREFIXES` 追加は**不要** |
| `lib/csv.ts` | `serializeCsv` / `csvResponseHeaders` を流用 |
| `lib/time.ts` | `startOfTodayJST` / `startOfMonthJST` / `endOfMonthJST` / `parseYmdJST` / `combineDateAndTimeJST` / `formatJSTHHmm` を流用。**新規関数追加なし** |
| `lib/attendance.ts` | `buildSessions` を `deriveReportDefaults` の内部で呼び出し、打刻からセッションを推定し items 雛形を作る |
| `AppHeader` コンポーネント | 既存 `app/_components/AppHeader.tsx` をそのまま使う |
| `/admin` トップ | 残業未承認バナー・車両警告と同様、「未確認日報 N件」リンクカードを追加 |

### J. マイグレーション戦略

残業申請・車両管理と同じ手順。

```
ローカル:
1. prisma/schema.prisma を追記
2. npx prisma migrate dev --name add-daily-report
   → prisma/migrations/<timestamp>_add_daily_report/migration.sql 生成
3. npx prisma generate
4. npm run seed で DailyReport / DailyReportItem サンプル投入
5. npm run dev で動作確認

本番(Turso):
6. migration.sql の中身を読み、ALTER系のみ抽出
7. turso db shell <db-name> < migration.sql で適用
   - もしくは prisma migrate deploy が動くなら自動適用
8. 適用後に SELECT count(*) FROM DailyReport で確認
```

**注意**:
- `(userId, reportDate)` 複合unique は SQLite では NULL 重複の問題なし（両方 NOT NULL なので安全）
- `DailyReportItem.onDelete: Cascade` は SQLite で `ON DELETE CASCADE` の DDL を生成する。Turso でも同様に動作するはず（過去のマイグレーション履歴で確認）
- 既存 `OvertimeRequest` の Cascade 設定有無を参照して整合を取ること

### K. seed (`prisma/seed.ts` 拡張)

```
- DailyReport 3件
  - 1件: status="draft" (member 1名、当日)
  - 1件: status="submitted" (member 2名目、当日)
  - 1件: status="acknowledged" (member 3名目、3日前)
- DailyReportItem 各報告に 2-3 件ずつ
  - 既存 WorkSite を再利用（残業申請のseedで投入済）
- progressNote は実例 (空調業の実務感あるサンプル文)
  - 例: "配管材不足、明日追加発注。○○邸の引渡し日変更を客先と要調整"
```

manager / member の seed は既存通り（ニナウ社員14名）。

---

## 却下案と理由

### 工数の表現

| 案 | 概要 | 採用判定 | 却下/採用理由 |
|---|---|---|---|
| **A. 時間入力（分単位）（採用）** | 開始/終了時刻 → 工数を自動計算保存 | **採用** | 入力直感的。打刻との突合が可能 |
| B. ％配分入力 | 1日100%を作業に按分 | 却下 | 直感に反する。1日の総時間が暗黙前提で曖昧 |
| C. 時間 + ％ 両併記 | 入力モード切替 | 却下 | UI複雑化、ユーザー混乱 |
| D. 工数のみ入力（開始/終了時刻なし） | 「○○現場 3時間」だけ | 却下 | タイムライン情報を捨てる、月次分析の精度が落ちる |

### 状態管理

| 案 | 概要 | 採用判定 | 却下/採用理由 |
|---|---|---|---|
| **A. draft / submitted / acknowledged（採用）** | 3段階・差戻なし | **採用** | デモのスコープ最小、ちゃんと感は出る |
| B. 残業申請と同じ4状態（submitted/approved/rejected/sent_back） | 差戻フロー追加 | 却下 | 残業申請と同じ機能を別画面で繰り返す価値が薄い。日報は差戻ではなく口頭フィードバックが自然 |
| C. draft のみ（提出概念なし） | 自動保存で永久編集可 | 却下 | manager が「いつ確定したか」を判断できない |

### データモデル

| 却下案 | 理由 |
|---|---|
| 作業アイテムを別テーブルにせず、`DailyReport.itemsJson` JSON カラムで持つ | CSV出力時の正規化が困難、現場別集計のJOIN ができない。明細別テーブルは必須 |
| `DailyReport.totalMinutes` を保存せず毎回SUM | 月次レポートでN+1。保存値+items 更新時に再計算が正解 |
| `progressNote` を `trouble` / `handover` / `progress` の3カラム分離 | UI 複雑化。1欄統合でデモ十分。将来必要なら追加 |
| 同日複数日報を許容（時刻範囲別） | 業務実態に反する。「1日1日報・複数作業アイテム」が自然 |
| `acknowledgedById` を持たず、`acknowledged` のbooleanだけ | 「誰が確認したか」がデモで重要。manager 複数いる前提では必須 |

### API境界

| 却下案 | 理由 |
|---|---|
| 全部 Route Handler (`/api/report/*`) | 自動保存で `useActionState` + Server Actions が圧倒的に書きやすい |
| 全部 Server Actions（CSVも含む） | バイナリ/ストリームレスポンスがServer Actionsでは扱いにくい |
| 作業アイテム毎にAPIエンドポイント分離（追加・更新・削除を個別） | 全件 upsert（delete→再作成）で十分単純、N+1なし |

### 自動保存

| 却下案 | 理由 |
|---|---|
| localStorage 下書き保持 | 別端末切替で消える、サーバ側 draft が真の保存先 |
| 即時保存（debounce なし） | フォーム入力中の連打でサーバ負荷増、UI lag |
| 手動保存のみ | スマホで途中離脱時に消失リスク高 |

---

## 失敗モードと対策

| # | 失敗モード | 検知 | 対策 |
|---|---|---|---|
| 1 | 同一日に同一ユーザーの DailyReport を複数作成しようとする | `@@unique([userId, reportDate])` でDBレベルで防止 | upsert で一意制約違反を吸収 |
| 2 | items 並び順の不整合（順序変更直後の自動保存タイミング） | サーバで `orderIndex` を 0,1,2,... で再付番 | クライアントは表示順通り送信、サーバが正規化 |
| 3 | items の時刻重複（朝8-10と9-11が両方ある） | バリデーション | 警告のみ、ブロックしない（休憩跨ぎなど正当ケースあり） |
| 4 | items が0件で submit | バリデーション | エラーで送信拒否「作業アイテムを1件以上追加してください」 |
| 5 | startAt >= endAt | バリデーション | エラー |
| 6 | endAt が reportDate +30h を超える（深夜跨ぎ） | バリデーション | エラー（残業申請と同じ閾値で統一） |
| 7 | 600文字超の progressNote | サーバ側 `codePointLength` チェック | エラー、絵文字対策含む |
| 8 | 同時に2人のmanagerが同じ日報を確認 | 楽観ロック | `updateMany where status="submitted"` の更新行数で検知、0なら409 |
| 9 | 自動保存とmanual提出のレース | submit時に status を変える前に必ず最新の items を upsert | フォーム送信時は「全件をJSONで送る + status=submitted を渡す」を1トランザクションで |
| 10 | 過去日報の遡及作成（member） | reportDate=今日(JST) のみ許可 | エラー「日報は当日中に作成してください」 |
| 11 | 過去日報の遡及作成（manager） | 7日以内に限定、UI で「代理作成」と表記 | サーバ側で `now - reportDate <= 7days` を検証 |
| 12 | manager が確認後に member が編集 | acknowledged は member 編集不可 | フォームで非活性化、サーバでも422 |
| 13 | acknowledged の取消し（誤確認） | manager のみ可、ログ無し | `unacknowledgeReport` で status を draft に戻す（submitted ではなく draft、再提出を促す） |
| 14 | items 10件超 | バリデーション | エラー、UI でも + ボタンを非活性化 |
| 15 | description 80文字超 | バリデーション | エラー、UI でカウンタ表示 |
| 16 | 現場名の表記ゆれ（既存テーブル共有） | `.trim().normalize("NFKC")` をサーバ側で強制 | 残業・車両と同じ処理 |
| 17 | CSV の作業内容に改行/カンマ混入 | `lib/csv.ts: escapeCell` が処理 | テスト済 |
| 18 | UTF-8 BOM忘れ | Excel文字化け | `serializeCsv` が BOM 付与済 |
| 19 | `reportDate` をUTC扱いしてしまう | 月境界で前月にズレる | `lib/time.ts` の `startOfMonthJST` / `endOfMonthJST` を使う |
| 20 | 退職した member の過去日報参照 | `User.isActive=false` 運用 | 物理削除しない。氏名そのまま表示、`/admin/report` の当日提出者リストには active のみ |
| 21 | 自動保存中にネットワーク切断 | クライアント側エラーハンドリング | toast で「保存に失敗、再試行してください」表示。次の debounce で自動再試行 |
| 22 | 大量items の同時提出で totalMinutes 集計遅延 | items 10件上限のため実用上問題なし | 上限超過時はバリデーションで弾く |
| 23 | acknowledged 後に削除したい | デモでは UI からの削除動線なし | 物理削除は admin 開発者ツールから手動。`status="draft"` に戻す運用で代替 |
| 24 | manager が自分自身の日報を確認 | 同一ユーザーの ack 許可するか | デモでは許可（manager 6名のうち現場兼任あり）。`acknowledgedById = userId` を許容 |

---

## 実装順序

依存の薄い順、早期検証可能な順。残業申請・車両管理と同じ Phase 区切り。

### Phase A: モデル + seed + 一覧（manager が「日報があること」を確認できる）

| # | タスク | 概算行数 | 依存 |
|---|---|---|---|
| 1 | `prisma/schema.prisma` 拡張（DailyReport / DailyReportItem 追加 + User/WorkSite に relation 追加） | +80行 | - |
| 2 | `prisma/migrations/<ts>_add_daily_report/migration.sql` 生成 + `prisma generate` | 自動 | 1 |
| 3 | `prisma/seed.ts` に DailyReport 3件 + items 計7件 追加 | +90行 | 1 |
| 4 | `lib/daily-report.ts` 新設: 型定義 / バリデーション / 集計関数 / `deriveReportDefaults` | +260行 | 1 |
| 5 | `/report` member 向けトップ（今日の日報カード + 履歴30件） | +160行 | 4 |
| 6 | `/admin/report` manager 向けダッシュボード（未確認バナー + 当日提出一覧 + 7日ヒートマップ） | +220行 | 4 |

### Phase B: 作成・編集（フローが回る）

| # | タスク | 概算行数 | 依存 |
|---|---|---|---|
| 7 | `app/report/actions.ts` 新設: upsertReport / submitReport / withdrawReport | +180行 | 4 |
| 8 | `/report/today` 編集フォーム（items リスト + 自動保存 + 提出） | +320行 | 7 |
| 9 | `/report/[id]` 過去日報詳細（自分のもの。閲覧 + 取下げ） | +130行 | 4 |
| 10 | `/admin/report/[id]` 個別詳細 + 確認アクション | +180行 | 4 |
| 11 | `app/admin/report/actions.ts` acknowledgeReport / unacknowledgeReport | +90行 | 4 |

### Phase C: 月次・CSV

| # | タスク | 概算行数 | 依存 |
|---|---|---|---|
| 12 | `/admin/report/month` 月次サマリ（社員別・現場別） | +220行 | 4 |
| 13 | `/api/admin/report/items/route.ts` CSV エンドポイント | +110行 | 4 |
| 14 | `/admin` トップに「未確認日報 N件」リンクカード追加 | +30行 | 6 |
| 15 | `app/globals.css` に `.dr-*` スタイル追記（既存トークン組合せのみ） | +160行 | - |
| 16 | E2E動作確認: seed → 編集（自動保存） → 提出 → 確認 → 月次CSV出力 | - | 全て |

**合計概算**: フロント 約1,500行 / バック・lib 約530行 / Prisma 約80行 / seed 約90行 / CSS 約160行 = **約2,360行**。

**マイルストーン**:
- M1（3完了）: スキーマ確定・seed投入できる
- M2（4完了）: lib層の単体テストが通る
- M3（5-6完了）: 一覧画面でデータが見える（demo可能ライン α）
- M4（7-11完了）: 作成→提出→確認のループが回る（demo可能ライン β）
- M5（12-14完了）: 月次レポート・CSV まで完成（demo フル機能）
- M6（15-16完了）: 仕上げ・全体動作確認

**並行化の余地**:
- 5 と 6 は別ファイル、ui-designer に**順番に**投げる（同時実行はサブエージェント規約で禁止）
- 13 と 15 は独立、4 と 6 完了後に Main Claude or 別エージェントで並行作業可能
- 8 のフォームが最大の複雑度。`useActionState` + 自動保存 + items リスト編集を1コンポーネントに収めるかは ui-designer 判断

---

## 未解決事項

1. **自動保存の debounce 秒数**: 5秒で十分か。ニナウ社員の入力速度・通信環境（仙台市内+郊外現場の4G/5G差）に依存。デモ会場では3秒の方が「保存されている感」が出る可能性
2. **打刻からの自動 items 生成**: `deriveReportDefaults` が IN/OUT セッションを元にする方針だが、昼休憩で OUT/IN を打つ社員と打たない社員が混在。混在前提でどう推定するかは要相談（researcher 案件候補）
3. **manager の代理作成範囲**: 7日遡及で十分か。退職者の最終日報を後から登録するケースは含めるか
4. **写真添付**: 営業デモで必ず聞かれる。`DailyReportItem.photoUrls Json?` で将来追加可能とだけ明記、デモには含めない
5. **AI要約**: 「今日の社内全体の動き」を1行要約するのは打刻ダッシュボードでやっているが、日報の AI要約も需要が出る可能性（researcher 案件）
6. **進捗・トラブル・申し送りの3欄分離**: 現状1欄だが、ニナウ社の既存日報フォーマットによっては分離要望が出る可能性。営業前に元帳ヒアリング
7. **複数 manager の通知ルーティング**: 今は全 manager に未確認バナーが見える。「自分の部下だけ表示」する組織階層は実装外。User.role に `managerOf: string[]` のような構造化は将来要件

---

## 実装担当者への申し送り

- AGENTS.md の通り、書く前に `node_modules/next/dist/docs/` を読むこと。Next.js 16 のServer Actions / Route Handlers / `cookies()` API は本設計書記載と挙動が違う可能性がある。**設計書ではなくドキュメントを正とする**
- 既存の `app/overtime/actions.ts` と `lib/overtime.ts` を**手本**にする。型シグネチャ・revalidatePath の対象・redirect のクエリパラメータ規約まで揃える
- Tailwind禁止。`app/globals.css` の既存トークンを組み合わせる。新色を入れたい時は architect に相談
- UI実装は ui-designer に委譲する（Main Claudeは書かない）。ブリーフには本設計書 §G を抜粋して渡すこと。特に「作業アイテムリスト編集 + 自動保存」のUIパターンは新規性が高いので詳細指示が必要
- マイグレーション後、`prisma/dev.db` を削除して `npx prisma migrate dev` + `npm run seed` で再構築可能なことを必ず確認
- proxy.ts の PUBLIC_API_PREFIXES への追加は**不要**（CSV含め全てログインセッション必須）
- `(userId, reportDate)` 複合unique は upsert で扱うこと（`prisma.dailyReport.upsert({ where: { userId_reportDate: { ... } } })`）
