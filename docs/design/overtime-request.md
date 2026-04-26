# 残業申請機能 設計書

最終更新: 2026-04-26
担当: architect
対象: butaifarm-attendance/web/

---

## 背景と目的

舞台ファーム勤怠デモアプリに「残業申請」機能を追加する。現状は共有タブレット運用・認証なしの打刻デモ（出勤/退勤のみ）。
営業向けデモで「残業の事前承認フロー」と「現場名・作業内容を含む月次CSV」が見える状態にすることで、SaaS既製品との差別化（現場固有項目の柔軟性）を訴求するのが本機能の目的。

**前提（重要・誤解しやすい）**:
- 本番運用ではなく**デモ用途**。法令準拠（36協定上限・電帳法保管）はスコープ外。
- SQLite + Prisma 6 をそのまま使う（Vercel非デプロイ、ローカル/オンプレ前提）。
- 認証なしを維持する。「承認者」概念の最小実装が最大の論点。
- Tailwind不採用。`app/globals.css` の既存トークンを使う（`--primary`/`--warn`/`--danger`/`--surface`等）。
- **実装担当者は `node_modules/next/dist/docs/` を読むこと**（AGENTS.md指示）。Server Actions/Route Handlersの作法は本設計書ではなくそちらを正とする。

---

## 要件

### 機能要件

| ID | 要件 |
|---|---|
| F-1 | 申請者が残業申請を作成できる（申請日・開始/終了時刻・現場名・作業内容・申請種別） |
| F-2 | 退勤打刻 (`type=OUT`) があれば、終了時刻にプリフィルできる |
| F-3 | 開始時刻は「所定終業時刻」をデフォルト値にする（後述、`/admin/settings`で可変） |
| F-4 | 残業時間は開始/終了から自動計算して表示（DB保存もする） |
| F-5 | 現場名は過去使用の上位サジェスト（`WorkSite` マスタ + 利用頻度） |
| F-6 | 作業内容は最大200文字（クライアント・サーバー両側でバリデーション） |
| F-7 | 申請種別: `pre`（事前）/ `post`（事後）。事後は当日中（JST 23:59:59）に限り受付 |
| F-8 | 状態遷移: `submitted → approved / rejected / sent_back`、`sent_back → submitted`（再申請） |
| F-9 | 承認者は差戻時にコメントを必須記入 |
| F-10 | 承認後に月次レポートの残業集計に反映される |
| F-11 | 月次CSV（UTF-8 BOM付き）に現場名・作業内容を含めて出力できる |

### 非機能要件

| ID | 要件 |
|---|---|
| NF-1 | 共有タブレットで「次の人」がすぐ操作できる（フォーム入力中の選択ユーザーは画面トップで切替可能） |
| NF-2 | 既存打刻 (`POST /api/punch`) の体験を壊さない（同一URLで動かし続ける） |
| NF-3 | SQLite制約: enum未対応 → 文字列+チェック関数で代替 |
| NF-4 | SQLite制約: 単一writer → トランザクション競合は実用上ほぼ起きないが、状態遷移は `updateMany` + `where: { status: <expected> }` で楽観ロック |
| NF-5 | デザイントークン遵守（`#0f766e` / `#4d7c0f` / `#f6f7f3`、その他は既存CSS変数） |

---

## 採用案

### A. 画面構成と承認者モデルの結論

- **承認者モデル**: 後述「却下案と理由」で比較した結果、**案B（User.role を追加）+ 案C（管理画面の承認アクションだけ簡易PIN）の併用**を採用。
  - `User.role` を `member` / `manager` の2値に拡張（admin はデモ範囲外）
  - 共有タブレットで `/admin/overtime` 配下に入る前に4桁PIN（環境変数 `OVERTIME_APPROVER_PIN`、未設定ならスキップ）
  - PINはサーバー側で `httpOnly` Cookie に署名付きトークンを発行（JWT不要、HMAC-SHA256で十分）。Cookie寿命は4時間
  - 承認ボタン押下時に、画面上の「承認者として記録するユーザー」を `manager` から選択（PINで入った後の誰が押したかは記録する）
- **画面構成**:
  - `/overtime` … 申請者用エントリ。上部に「申請者を選ぶ」セレクト（打刻画面と同じ思想）、下にタブ（新規申請 / 自分の履歴）
  - `/overtime/new` … 新規申請フォーム（**確認ステップは同一画面のステップ式**にする。タブレットでページ遷移を増やすとUX悪化）
  - `/overtime/[id]` … 詳細画面。差戻コメントの表示・再申請動線
  - `/admin/overtime` … 承認キュー（PIN通過後）。一覧 + インライン承認/差戻
  - `/admin/overtime/report` … 月次集計＋CSVダウンロード（PIN通過後）
  - `/admin/settings/overtime` … 所定終業時刻・現場名マスタ管理（PIN通過後）

### B. データモデル（Prisma）

```prisma
// 既存 User に role 追加
model User {
  id        String       @id @default(cuid())
  name      String
  role      String       @default("member")   // "member" | "manager"
  createdAt DateTime     @default(now())
  records   TimeRecord[]
  overtimeRequests        OvertimeRequest[] @relation("Applicant")
  overtimeReviewedRequests OvertimeRequest[] @relation("Reviewer")
}

// 既存 TimeRecord 変更なし（後方互換のため触らない）

model OvertimeRequest {
  id            String   @id @default(cuid())

  // 申請者
  userId        String
  user          User     @relation("Applicant", fields: [userId], references: [id])

  // 業務日（JST基準の0:00、DateTimeで保持。境界判定は lib/time.ts の startOfTodayJST 同等関数を新設）
  workDate      DateTime

  // 残業時間帯
  startAt       DateTime
  endAt         DateTime
  durationMinutes Int                       // 保存時に (endAt - startAt) / 60000 をサーバーで計算

  // 業務情報
  workSiteName  String                       // マスタ参照ではなく文字列スナップショット保存（マスタ改名で過去申請が変わるのを避ける）
  workSiteId    String?                      // 入力補助のリンク（任意）
  workSite      WorkSite? @relation(fields: [workSiteId], references: [id])
  description   String                       // 200文字上限。バリデーションで制約

  // 申請種別・状態
  requestType   String                       // "pre" | "post"
  status        String   @default("submitted") // "submitted" | "approved" | "rejected" | "sent_back"

  // 承認情報
  reviewerId    String?
  reviewer      User?    @relation("Reviewer", fields: [reviewerId], references: [id])
  reviewedAt    DateTime?
  reviewComment String?                      // 差戻コメント（rejected/sent_back時に必須）

  // 監査
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // 履歴（差戻→再申請の連鎖）
  parentId      String?
  parent        OvertimeRequest?  @relation("ResubmitChain", fields: [parentId], references: [id])
  children      OvertimeRequest[] @relation("ResubmitChain")

  @@index([userId, workDate])
  @@index([status, workDate])
  @@index([workDate])
}

model WorkSite {
  id          String   @id @default(cuid())
  name        String   @unique
  isActive    Boolean  @default(true)
  usageCount  Int      @default(0)            // サジェスト並び替え用カウンタ。承認時に+1
  createdAt   DateTime @default(now())
  requests    OvertimeRequest[]
}

model AppSetting {
  // 設定値を1テーブルで持つ。所定終業時刻が増えたら拡張。
  key   String @id            // "regular_end_time" | "overtime_approver_pin_hash" 等
  value String                 // "17:30" のようなフリーフォーマット文字列
  updatedAt DateTime @updatedAt
}
```

**設計判断のポイント**:
- `workSiteName` を**文字列スナップショット**で保存。マスタ改名で過去レコードが書き換わるのを防ぐ（売上/勤怠の鉄則）。
- `parentId` 自己参照で差戻→再申請を**チェーン**として残す。前回申請を消さず履歴を辿れる。
- `durationMinutes` を**保存値**として持つ（毎回計算するとCSV/集計でズレ要因になる）。`startAt`/`endAt` を更新したら必ず再計算するロジックを `lib/overtime.ts` に集約。
- SQLiteなので `enum` を使わず文字列。型安全のため `lib/overtime.ts` に `OvertimeStatus`/`RequestType` の Union 型と `assertOvertimeStatus(s: string)` を用意。
- `AppSetting.value` は文字列1カラム（YAGNI）。型解釈は呼び出し側。

### C. 状態遷移

```
                +------------+
                |  (initial) |
                +------+-----+
                       | createRequest (申請者)
                       v
                +------+-----+
   resubmit    | submitted  |  reject
   +---------- |            | -----------+
   |           +-----+------+            |
   |                 |                   |
   |                 | approve (manager) |
   |                 v                   v
+--+-------+  +------+-----+      +------+------+
|sent_back |  | approved   |      | rejected    |
+----------+  +------------+      +-------------+
   ^   |
   |   | createResubmission (=新しいOvertimeRequest with parentId)
   |   v
   |  submitted (新行)
   +------ sendBack (manager, with comment)
```

| 遷移 | 操作者 | 入力必須 | 制約 |
|---|---|---|---|
| `(none) → submitted` | 申請者本人（画面で選択中のユーザー） | 全フィールド | `requestType=post` の場合 `workDate=今日(JST)` のみ |
| `submitted → approved` | manager | reviewerId | 楽観ロック必須 |
| `submitted → rejected` | manager | reviewerId, reviewComment | reviewComment 1文字以上 |
| `submitted → sent_back` | manager | reviewerId, reviewComment | reviewComment 1文字以上 |
| `sent_back → (新OvertimeRequest with parentId)` | 元の申請者 | 全フィールド | `sent_back` 行は status を変えず**新行を作る**（履歴保持） |

**楽観ロックの実装**: `prisma.overtimeRequest.updateMany({ where: { id, status: "submitted" }, data: {...} })` で更新行数を確認。0なら409を返す。

### D. API境界

#### 採用: Server Actions 主導 + 管理者操作のみ Route Handler

申請者側（新規・自分の履歴）は Server Actions で十分（CSRF対策はNext.jsが自動）。
管理者側は `Cookie` のPINトークン検証を**ミドルウェアで一括**したいので Route Handler（`/api/admin/overtime/...`）を切る。CSV出力もRoute Handlerでないとバイナリ応答が書きにくい。

| エンドポイント | メソッド | 用途 | 認可 |
|---|---|---|---|
| `app/overtime/new` の Server Action `createOvertimeRequest` | - | 申請作成 | 申請者選択は画面状態 |
| `app/overtime/[id]` の Server Action `createResubmission` | - | 再申請作成（parentId 付き） | 申請者本人のみ |
| `app/overtime/[id]` の Server Action `withdrawRequest` | - | 取消（submitted のみ） | 申請者本人のみ |
| `POST /api/admin/overtime/[id]/approve` | POST | 承認 | PINトークン |
| `POST /api/admin/overtime/[id]/reject` | POST | 却下（コメント付） | PINトークン |
| `POST /api/admin/overtime/[id]/send-back` | POST | 差戻（コメント付） | PINトークン |
| `GET /api/admin/overtime/report.csv?ym=2026-04` | GET | 月次CSV | PINトークン |
| `POST /api/admin/auth/pin` | POST | PIN検証→Cookie発行 | rate limit (60req/h/IP) |
| `POST /api/worksite` | POST | 現場名追加（重複時は upsert） | PINトークン |

**リクエスト/レスポンス例**:

```ts
// POST /api/admin/overtime/[id]/approve
// Request
{ reviewerId: string }
// Response 200
{ id: string, status: "approved", reviewedAt: string }
// Response 409
{ error: "stale_status", currentStatus: "approved" | "rejected" | "sent_back" }
```

```ts
// Server Action createOvertimeRequest input
{
  userId: string;
  workDate: string;           // "YYYY-MM-DD" (JST)
  startAt: string;            // ISO 8601 with timezone
  endAt: string;
  workSiteName: string;       // 1..50文字
  workSiteId: string | null;
  description: string;        // 0..200文字
  requestType: "pre" | "post";
}
// 返り値: { id: string } | { error: ValidationErrors }
```

### E. 退勤打刻からの自動セット仕様

**所定終業時刻の出所（最重要・現状未定義）**:
- 現状コードベースに「所定終業」概念はゼロ。新設する。
- `AppSetting.regular_end_time` に `"17:30"` のような JST `HH:mm` 文字列を保存。デフォルトは `"17:30"`（営業向け説明: 「農業法人で一般的な定時として仮置き」）。
- `/admin/settings/overtime` でmanagerが変更可。
- 将来「曜日別」「個人別」が必要になったら同テーブル拡張または別テーブル化（YAGNI、デモでは1値固定）。

**プリフィルロジック (`lib/overtime.ts: deriveDefaults`)**:

```
入力: userId, workDate(JST 0時), now
1. workDate当日の TimeRecord を timestamp ASC で取得
2. type="OUT" を全件抽出
   - 0件: startAt = workDate + regular_end_time, endAt = max(now, startAt + 30分) ※末尾は手動編集前提
   - 1件: startAt = max(workDate + regular_end_time, OUT.timestamp - 30分の閾値…ではなく **そのまま regular_end_time**)
          endAt = OUT.timestamp
   - 2件以上: 「最後の OUT」を採用 + 画面に注意トースト「打刻が複数あります、最後の退勤を採用しました」
3. startAt >= endAt の場合: endAt を startAt + 1時間にフォールバック + 編集要求トースト
4. 残業時間 < 0 または > 12時間: warning フラグ（送信は許可、UIで警告表示）
```

**設計判断**: 「OUTの瞬間 = 残業終了」と単純化する案も検討したが、定時前に退勤した日や打刻忘れが頻発するため、**所定終業時刻起点のほうがフォームの初期値として安全**。OUTがあれば endAt のみ採用。

### F. 処理フロー: 月次集計と既存ガントの連携

既存の `lib/attendance.ts: buildSessions` は「IN→OUT」の実労働時間。残業申請は別軸。
新規 `lib/overtime-aggregate.ts` を作り、以下を提供:

```ts
type MonthlyOvertimeRow = {
  userId: string;
  userName: string;
  workedMinutes: number;          // TimeRecordから算出（既存 buildSessions の月次版）
  approvedOvertimeMinutes: number; // OvertimeRequest where status=approved
  pendingOvertimeMinutes: number;  // status in (submitted, sent_back)
  diffMinutes: number;             // workedMinutes - 所定労働分(8h × 出勤日数) - approvedOvertimeMinutes
                                    // 「実態のほうが申請より長い」検出用
};
```

`/admin/overtime/report` でこの行をテーブル表示し、`diffMinutes` が正の人だけ警告色（既存 `--warn`）。
**「自動反映」要件はこの集計画面で満たす**（実労働時間自体は変えず、横並び比較として見せる）。

### G. CSV仕様

- ファイル名: `overtime_<YYYY-MM>.csv`
- 文字コード: **UTF-8 BOM付き**（Excel互換）
- 改行: CRLF
- 区切り: カンマ
- 月境界: JST `[YYYY-MM-01 00:00:00, 翌月-01 00:00:00)` を `workDate` 基準で抽出
- 列定義（※実装担当者向けに固定順、変更厳禁）:

| 列 | 値 | 型 | 例 |
|---|---|---|---|
| 申請ID | `id` | string | `clx...` |
| 業務日 | `workDate` (JST `YYYY-MM-DD`) | string | `2026-04-15` |
| 申請者 | `user.name` | string | `田中 太郎` |
| 申請種別 | `requestType` (`pre`/`post` → `事前`/`事後`) | string | `事前` |
| 状態 | `status` (4種を日本語化) | string | `承認済` |
| 開始時刻 | `startAt` (JST `HH:mm`) | string | `17:30` |
| 終了時刻 | `endAt` (JST `HH:mm`) | string | `19:45` |
| 残業時間（分） | `durationMinutes` | int | `135` |
| 残業時間（h:mm） | `durationMinutes` を整形 | string | `2:15` |
| 現場名 | `workSiteName` | string | `仙台中央ハウス` |
| 作業内容 | `description`（`"`で囲み、内部 `"` は `""` にエスケープ） | string | `"収穫機の清掃、""廃液処理""含む"` |
| 承認者 | `reviewer.name` | string | `佐藤 花子` |
| 承認日時 | `reviewedAt` (JST `YYYY-MM-DD HH:mm`) | string | `2026-04-15 21:00` |
| 差戻コメント | `reviewComment`（同上エスケープ） | string | `""` |

**承認済のみ出力するか全件出力するか**: 経理用途を想定し**承認済+承認日時降順**を**デフォルト**、クエリ `?status=all` で全件。

### H. UI/UX 注意点（ui-designer への brief 用）

- フォーム1画面ステップ式: ステップ1=日付・時刻・現場・内容、ステップ2=確認、ステップ3=送信完了。「次へ」「戻る」のみで遷移。
- タブレット向け: 入力欄は `min-height: 56px`、フォントサイズ16px以上。
- 現場名はオートコンプリート（datalist でも可、過去30日の使用順）。
- 200文字カウンタ右下表示（180超で `--warn` 色）。
- 状態バッジの色割当: `submitted` = `--primary-soft`、`approved` = `--primary`、`rejected` = `--danger-bg`、`sent_back` = `--warn-bg`。

---

## 却下案と理由

### 承認者モデル

| 案 | 概要 | 採用判定 | 却下/採用理由 |
|---|---|---|---|
| **A. 全員承認可（無認可）** | 誰でも承認できる、承認者は画面で名前選択 | 却下 | デモでも「承認の重み」が見えないと商談で説得力が弱い。「ちゃんと感」不足 |
| **B. User.role 追加** | `manager` ロールのユーザーだけが承認できる | 一部採用 | データモデルとしては必要。ただし共有タブレットで誰でもmanagerを選べてしまうので単独では弱い |
| **C. 承認画面PINガード** | `/admin/overtime` 以下に入る前にPIN | 一部採用 | 物理的にmanagerだけが知ってる前提を作れる。デモで「パスコード入れます」が映える |
| D. NextAuth導入 | 本物のOAuth | 却下 | デモのスコープ越え、セットアップ手間で立ち上げが遅くなる |
| E. ローカルJWT + ログイン画面 | 簡易ログイン | 却下 | 共有タブレットでログアウト忘れの事故、デモの「すぐ触れる感」を損なう |

→ **B + C 併用**を採用。

### データモデル

| 却下案 | 理由 |
|---|---|
| `OvertimeRequest.workSiteId` 必須・名前は WorkSite から都度引く | マスタ改名/削除で過去申請が壊れる。スナップショット必須 |
| `status` を `Int` enum 風で持つ | SQLiteで可読性が落ち、CSV出力でマッピングが分散。文字列+型ガードで十分 |
| 差戻時に同じ行の status を `sent_back` に変えて再編集可能 | 履歴が消える、誰がどの版を見て差戻したかが追えなくなる。`parentId` チェーンで新行を作る |
| `durationMinutes` を保存せず毎回計算 | CSV/集計でタイムゾーン扱いを間違えると数字がズレる。保存して整合性チェックしやすくする |

### API境界

| 却下案 | 理由 |
|---|---|
| 全部 Route Handler (`/api/overtime/*`) | 申請フォームの楽観UI更新で `useFormState` + Server Actions が圧倒的に書きやすい |
| 全部 Server Actions（CSVも含む） | バイナリ/ストリームレスポンスがServer Actionsでは扱いにくい。CSVだけRoute Handlerが素直 |
| GraphQL/tRPC | デモ規模に対しオーバーキル |

### 確認ステップ

| 却下案 | 理由 |
|---|---|
| `/overtime/new/confirm` 別ページ | タブレット運用で画面遷移が多いと「次の人」へバトンタッチが遅い |
| モーダル | フォームの入力値再編集動線がぎこちなくなる |

---

## 失敗モードと対策

| # | 失敗モード | 検知 | 対策 |
|---|---|---|---|
| 1 | 同一日に複数の残業申請を作って重複承認される | `(userId, workDate, status in active)` で一意制約は**かけない**（時間帯が分かれた残業もあり得る）が、フォーム送信前に「同日に既存申請あり」警告を出す | `lib/overtime.ts: detectOverlap` で `[startAt, endAt)` の重なりを検出、警告UIに出す（送信はブロックせず確認させる） |
| 2 | `requestType=post` の境界（23:59:59 JST）跨ぎ | サーバー時刻でJST判定 | `workDate < 今日0時(JST)` かつ `requestType=post` なら 422。「事後申請は当日中」エラーメッセージ |
| 3 | JST跨ぎのバグ（深夜残業 20:00-26:00など） | `endAt` が翌日0時を超えるケース | `endAt > workDate + 30h` なら入力エラー。`endAt < startAt` も同様 |
| 4 | 200文字バリデーションがクライアントだけ | サーバー側で `.refine(s => [...s].length <= 200)` （**コードポイント基準**）を必ず通す。絵文字対策で `.length` ではなく `[...s].length` |
| 5 | 削除・取消の扱い | UIに「削除」を出すか | **物理削除しない**。`status=submitted` のみ申請者本人が `withdrawn` に変更できる動線を後付け可能にする（今回は実装外、`status` の文字列に `"withdrawn"` を将来追加できる余地を残す） |
| 6 | 差戻し後の再申請ループ | 親→子→孫…の連鎖が肥大化 | チェーン深さ5を超えたら警告UI。集計時はチェーン末端のみ採用 |
| 7 | 同時に2人のmanagerが同じ申請を承認/差戻 | 楽観ロック衝突 | `updateMany where status="submitted"` で1件以上更新できなければ409返却＋画面再取得 |
| 8 | PIN総当たり | ブルートフォース | `/api/admin/auth/pin` にメモリLRU rate limit（10回/min/IP）。デモでは十分 |
| 9 | PIN環境変数未設定で本番に出る | デフォルトで誰でも入れる | `OVERTIME_APPROVER_PIN` 未設定時は起動時にWARNログ + 画面に「DEMO MODE」帯表示 |
| 10 | 退勤打刻が複数（昼休憩用にOUT/INした等） | プリフィル時に最終OUTを採用、UI警告 | `deriveDefaults` で複数検知時に `warning: "multiple_clock_outs"` を返す |
| 11 | 退勤打刻なしで残業申請 | プリフィル不能 | startAt=所定終業、endAt=現在時刻でフォールバック。エラーにしない |
| 12 | 現場名マスタ重複（表記ゆれ） | `name @unique` で防ぐが「中央ハウス」「中央ハウス　」等のスペース | サーバー側で `.trim().normalize("NFKC")` してから保存・比較 |
| 13 | CSV の作業内容に改行/カンマ/ダブルクォート混入 | 全カラムを `"..."` で囲い、内部の `"` を `""` にエスケープ。改行は `\n` のまま保持（Excelで複数行セルになる） | テストで往復ロード確認 |
| 14 | UTF-8 BOM忘れ | Excelで文字化けクレーム | Buffer先頭に `﻿` 付与必須、unitテストで先頭バイト検証 |
| 15 | `workDate` をUTC扱いしてしまう | 月境界で前月にズレる | `lib/time.ts` 拡張で `startOfMonthJST` / `endOfMonthJST` を新設、`workDate` は常に「JSTの0時のUTC表現」に統一 |
| 16 | 承認後にユーザーが申請を変更 | 改ざんリスク | `status != "submitted"` のレコードへの編集は422で拒否 |
| 17 | manager退職でreviewerId参照切れ | User削除を物理ではなく `isActive=false` 列で対応…は今回スコープ外 | 現状はUser削除しない運用とする。設計書にメモ |
| 18 | 既存`/admin`ページに残業情報がなく見落とし | ダッシュボードに「未承認残業 N件」のリンクカードを追加（実装担当向け1行タスク） | サブセクション化 |

---

## 実装順序

依存の薄い順、早期検証可能な順。

| # | タスク | 概算行数 | 依存 |
|---|---|---|---|
| 1 | `prisma/schema.prisma` 拡張 + migration（dev.dbを一旦削除して再生成して良い、データはseedで作る） | +60行 | - |
| 2 | `prisma/seed.ts` に `WorkSite` 5件 + `User.role` 2名分manager + `AppSetting` 初期値 | +40行 | 1 |
| 3 | `lib/time.ts` 拡張: `startOfMonthJST`, `endOfMonthJST`, `parseHHmm`, `combineDateAndTime` | +40行 | - |
| 4 | `lib/overtime.ts` 新設: 型定義 / バリデーション / `deriveDefaults` / `detectOverlap` / `assertStatus` | +180行 | 1, 3 |
| 5 | `lib/overtime-aggregate.ts` 新設: 月次集計 | +100行 | 1, 3 |
| 6 | `lib/csv.ts` 新設: BOM付きCSV シリアライズ + ユニットテスト | +60行 | - |
| 7 | `lib/admin-auth.ts` 新設: PIN検証, Cookie発行/検証 | +80行 | - |
| 8 | Server Actions: `createOvertimeRequest`, `createResubmission`, `withdrawRequest` | +120行 | 4 |
| 9 | Route Handlers: `/api/admin/overtime/[id]/{approve,reject,send-back}`, `/api/admin/auth/pin`, `/api/admin/overtime/report.csv` | +180行 | 4, 6, 7 |
| 10 | 画面 `/overtime` `/overtime/new` `/overtime/[id]` | +400行（フォーム・確認ステップ・履歴） | 4, 8 |
| 11 | 画面 `/admin/overtime` `/admin/overtime/report` | +250行 | 5, 9 |
| 12 | 画面 `/admin/settings/overtime` | +100行 | 1 |
| 13 | `app/globals.css` に残業関連スタイル追記（既存トークンの組み合わせのみ） | +120行 | - |
| 14 | 既存 `/admin` トップに「未承認残業」カード追加 | +30行 | 5, 11 |
| 15 | E2E動作確認（seed → 申請 → 承認 → CSV出力） | - | 全て |

**合計概算**: フロント 約820行 / バック・lib 約720行 / Prisma 約60行 / seed 約40行 / CSS 約120行 = **約1,760行**。

**マイルストーン**:
- M1（2の完了時点）: スキーマ確定、seed投入できる
- M2（4-7の完了時点）: lib層が単体テストで確認できる
- M3（8-9の完了時点）: APIをcurlで叩いて承認フローが動く
- M4（10-12の完了時点）: 画面で一連のフローが見せられる（デモ可能ライン）
- M5（13-15の完了時点）: 仕上げ・既存ダッシュボード統合

**並行化の余地**: 4と6は独立、10と11は別ファイル群。ui-designerに10と11を順番に投げる（同時は禁止、競合防止）。

---

## 未解決事項

1. **所定終業時刻のデモ初期値**: `17:30` で良いか。営業先（仙台の現場）で実態と合っているか要確認。researcher案件にする選択肢あり
2. **manager の人数**: seedで2名作るが、デモの絵としては「manager 1名で承認集中している」と「2名で並列承認」のどちらが映えるか。ui-designerにブリーフを出す前に判断
3. **PIN未設定時のフォールバック挙動**: 現状「DEMO MODE」帯を出して通すと書いたが、これでいいか（デモ会場のWi-Fi事情で `.env` 設定漏れが起きうる）
4. **休日扱い**: 残業の概念は「所定労働時間を超えた分」だが、休日は所定労働がない。`workDate` が日曜の申請を区別する必要があるか。**今回はスコープ外**としたが、月次CSVに「休日フラグ」列を追加するかは要相談
5. **打刻の自動推定 vs 手動入力**: フォームの初期値として OUT を採用するが、「OUT がない＝退勤打刻忘れ」と判定して打刻を促すトースト出すか。UX判断としてui-designerに委ねたい
6. **CSV以外の出力形式（PDF/Excel）**: 営業デモで「PDF出ます？」と聞かれる可能性。スコープ外と明示しておく

---

## 実装担当者への申し送り

- AGENTS.md の通り、書く前に `node_modules/next/dist/docs/` を読むこと。Next.js 16 のServer Actions / Route Handlers / Cookie API は本設計書記載と挙動が違う可能性がある。**設計書ではなくドキュメントを正とする**
- Tailwind禁止。`app/globals.css` の既存トークンを組み合わせる。新色を入れたい時はarchitectに相談
- UI実装は ui-designer に委譲する（Main Claudeは書かない）。ブリーフには本設計書 §H と画面構成 §A を抜粋して渡すこと
- マイグレーション後、`prisma/dev.db` を削除して `npx prisma migrate dev` + `npm run seed` で再構築可能なことを必ず確認
