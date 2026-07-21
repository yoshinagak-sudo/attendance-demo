# SPEC: 勤怠申請（休日出勤 + 休暇・勤怠 7カテゴリ + 有給残日数）

対象: `butaifarm-attendance/web` (Next.js 16 App Router / Prisma 6 / libsql Turso)
既存パターン踏襲元: `OvertimeRequest` / `DailyReport` / `applyReview` / `requireAdminOrDashboard`
このドキュメントは実装前の意思決定を確定させるためのもの。実装コードは含まない。

---

## 1. 背景と目的

- 既に残業申請 (`OvertimeRequest`) が pre/post・submitted/approved/rejected/sent_back・再申請 chain で稼働している。
- 業務要件として、休日出勤 + 7 種の休暇・勤怠申請 + 年次有給休暇の残日数管理を同じ承認フローに乗せる。
- 目的は「紙・LINE で回っている申請を全部この画面に寄せる」こと。給与連携はスコープ外。

## 2. 要件の要約

| カテゴリ | 単位 | 有給残チェック | 特記 |
|---|---|---|---|
| holiday_work（休日出勤） | 時間 | 不要 | 残業と UI・スキーマ同型、カテゴリで分離 |
| absence（欠勤） | 日 | 不要 | |
| late（遅刻） | 時間 | 不要 | 出勤予定→実出勤 |
| early_leave（早退） | 時間 | 不要 | 実退勤→予定退勤 |
| personal_out（私用外出） | 時間帯 | 不要 | 開始→終了 |
| paid_leave（年次有給） | 全休/半休 | **必須** | 半休=0.5日 |
| special_leave（特別休暇） | 日 + 理由 | 不要 | 理由必須 |
| substitute_leave（振替休暇） | 日 + 元出勤日 | 不要 | 承認済み holiday_work とリンク |

事前(pre) は未来のみ、事後(post) は過去〜当日のみ。承認フローは残業と同じ4状態 + 再申請 chain。

---

## 3. 採用案

### 3.1 データモデル

#### 3.1.1 休日出勤の扱い（重要な分岐）

**採用: `OvertimeRequest` に `category: "overtime" | "holiday_work"` を追加し、既存モデルに載せる。**

理由（2行）:
- 休日出勤は「工数・現場・時刻範囲・申請種別・承認フロー・時間ベースの月次集計」がすべて残業と同型。
- 別テーブルにすると `queue-rows.tsx` と `overtime-aggregate.ts` を二重に書くことになり保守コスト過大。

`OvertimeRequest` への変更（後方互換）:

| 追加カラム | 型 | 意味 |
|---|---|---|
| `category` | `String @default("overtime")` | `"overtime"` \| `"holiday_work"` |

- 既存の `requestType` (pre/post) はそのまま。
- 既存レコードは `category="overtime"` として seed マイグレーションで確定。
- 一覧・集計は `category` で必ずフィルタする（後述 §6）。

#### 3.1.2 その他 6 カテゴリを載せる `AttendanceRequest`

新規モデル 1 本にまとめる。カラムは NULL 許容の union テーブル方式（1 モデル + カテゴリ別のオプショナル列）。

理由（2行）:
- 6 カテゴリすべてが 4 状態承認・reviewer・再申請 chain の骨格が同型。別モデル 6 個は queue / 一覧 / index の重複が過大。
- 差分は「単位（日/時間/時間帯）」「補足カラム（reason / substituteFor）」の 2 軸だけで、NULL 許容カラムに閉じ込められる。

```
model AttendanceRequest {
  id              String   @id @default(cuid())

  userId          String
  user            User     @relation("AttendanceApplicant", fields: [userId], references: [id])

  category        String   // "absence" | "late" | "early_leave" | "personal_out"
                           // | "paid_leave" | "special_leave" | "substitute_leave"
  requestType     String   // "pre" | "post"（既存 REQUEST_TYPES を流用）
  status          String   @default("submitted") // 既存 OVERTIME_STATUSES 流用

  // 共通：申請対象日
  workDate        DateTime // JST 0:00 に丸めた日（既存慣行）

  // 時間帯系（late / early_leave / personal_out / holiday_workは既存OvertimeRequestなのでここは無関係）
  startAt         DateTime?
  endAt           DateTime?
  durationMinutes Int?      // startAt/endAt から派生。無い場合は null

  // 日数系（absence / paid_leave / special_leave / substitute_leave）
  // paid_leave の全休=1.0 / 半休=0.5、それ以外は基本1.0固定
  leaveDays       Float?    // 有給以外は 1.0 固定、有給は 0.5 / 1.0

  // paid_leave 専用
  paidLeaveKind   String?   // "full" | "am_half" | "pm_half"

  // late / early_leave 専用：予定時刻（実時刻とのペア）
  scheduledAt     DateTime? // 遅刻=予定出勤、早退=予定退勤

  // special_leave 専用：理由（必須・後述バリデーション）
  reason          String?

  // substitute_leave 専用：紐付けられた休日出勤（category=holiday_work の OvertimeRequest.id）
  substituteForId String?
  substituteFor   OvertimeRequest? @relation("SubstituteFromOT", fields: [substituteForId], references: [id])

  description     String   @default("")  // 汎用備考（申請者コメント）

  // 承認
  reviewerId      String?
  reviewer        User?     @relation("AttendanceReviewer", fields: [reviewerId], references: [id])
  reviewedAt      DateTime?
  reviewComment   String?

  // 再申請 chain（残業と同じ）
  parentId        String?
  parent          AttendanceRequest?  @relation("AttendanceResubmit", fields: [parentId], references: [id])
  children        AttendanceRequest[] @relation("AttendanceResubmit")

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([userId, workDate])
  @@index([category, status, workDate])
  @@index([status, workDate])
  @@index([workDate])
}
```

**採用理由**（category ごと別テーブル案を却下する根拠は §4）:
- 6 カテゴリの承認・再申請・reviewer は完全同型。骨格が同じで差分が数カラムなら 1 テーブルが正。
- 単位（日/時間/時間帯）の差は「該当列が null なら未使用」で表現でき、DB 制約は次のチェック関数で担保する（SQLite に CHECK 制約は付けるが、真の担保は Server Action 側のバリデータ）。

**カテゴリ別 使用カラム表**:

| category | startAt/endAt/duration | leaveDays | paidLeaveKind | scheduledAt | reason | substituteForId |
|---|---|---|---|---|---|---|
| absence | – | 1.0 | – | – | – | – |
| late | 実出勤=startAt / endAt=scheduledAt写しでもよい | – | – | 予定出勤時刻 | – | – |
| early_leave | 実退勤=startAt / endAt=scheduledAt写しでもよい | – | – | 予定退勤時刻 | – | – |
| personal_out | 開始→終了 | – | – | – | – | – |
| paid_leave | – | 0.5 or 1.0 | full/am_half/pm_half | – | – | – |
| special_leave | – | 1.0 | – | – | 必須 | – |
| substitute_leave | – | 1.0 | – | – | – | 必須 |

late / early_leave の時刻表現（採用）:
- `startAt` = **実測時刻**、`endAt` = **予定時刻**（＝differenceが「遅刻/早退の分数」を意味する向き）
- 予定時刻は冗長になるが `scheduledAt` にも入れて集計時に画面表示を安定させる。
- `durationMinutes` は `|endAt - startAt|` で正の分数を保持（残業と符号を揃える）。

#### 3.1.3 有給付与テーブル `PaidLeaveGrant`

```
model PaidLeaveGrant {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation("PaidLeaveUser", fields: [userId], references: [id])

  grantedOn    DateTime // 付与日 (JST 0:00)
  expiresOn    DateTime // 付与日 + 2年（2年時効。JST 0:00 の翌日で「その日から使えない」判定）
  days         Float    // 通常 10.0 / 11.0 / ... / 20.0、半端付与も許容

  source       String   // "auto" | "manual"
  note         String?  // 手動発行時の理由 / 自動時は空

  grantedById  String?  // 手動発行者（manager）。auto なら null
  grantedBy    User?    @relation("PaidLeaveGrantor", fields: [grantedById], references: [id])

  createdAt    DateTime @default(now())

  @@index([userId, grantedOn])
  @@index([userId, expiresOn])
}
```

**自動 vs 手動を 1 テーブルで扱う理由**: 消化ロジックは付与源に依存しない（残 = Σ days（有効） − Σ 有給消化）。source は監査のためのラベル。

#### 3.1.4 User への追加

`User` に以下を追加:

| カラム | 型 | 意味 |
|---|---|---|
| `hireDate` | `DateTime?` | 入社日（有給自動付与の起点） |
| `defaultScheduledStartTime` | `String?` | HH:mm。遅刻申請の予定時刻既定値。null なら `AppSetting.default_scheduled_start_time`（後述） |
| `defaultScheduledEndTime` | `String?` | 同上、早退用。null なら既存の `regular_end_time` を使う |

#### 3.1.5 AppSetting への追加

| key | 意味 | 既定値 |
|---|---|---|
| `default_scheduled_start_time` | 遅刻申請 予定出勤の全社既定 | `"08:00"` |
| `am_half_start_time` | 午前半休の勤務終了時刻定義 | `"12:00"` |
| `am_half_end_time`   | 午前半休の午後勤務開始時刻 | `"13:00"` |
| `pm_half_start_time` | 午後半休の午後勤務開始時刻 | `"13:00"` |
| `regular_end_time` | 既存（早退・残業の予定退勤） | `"17:30"` |

「午前休の勤務時間帯は 13:00〜17:30、午後休は 08:00〜12:00」という現場常識は、集計時ではなく画面表示時にこの設定を読んで描画する（DB に永続化しない）。

### 3.2 残日数計算

**採用: DB クエリで導出する純関数。キャッシュしない。**

```
現時点(now)での有給残日数(userId) =
    Σ grant.days   WHERE grant.userId = ? AND grant.grantedOn <= now AND now < grant.expiresOn
  − Σ req.leaveDays WHERE req.userId = ? AND req.category = "paid_leave"
                    AND req.status IN ("submitted","approved")
                    AND req.workDate <  grant.expiresOn（付与ごとに突合。§7.4 FIFO 割当）
```

**採用理由**（キャッシュ案却下は §4）:
- 付与は年数回、消化は月数件レベルで負荷が軽い。1 ユーザーあたり 100 行を超えない。
- キャッシュすると `expiresOn` 到達の 0 時に一気に古くなる。派生値は永続化しない原則（learnings 参照）。

**「申請中 (submitted) も残から引く」の理由**: 承認待ちの申請を無視すると「実質残 0 なのに残 5 と表示 → 承認時に赤字になる」事故が起きる。差戻/却下時に自動的に戻る。UI では `残X日（うち承認済Y日 / 申請中Z日）` と分解表示する。

**FIFO 割当と時効切れ判定**: 消化を「付与の古い順」に割り当てる。時効ぎりぎりの分を優先消化することで、有給が塩漬けで失効するのを防ぐ。実装は「有効な付与を expiresOn 昇順にソートし、消化を先頭から差し引く」純関数で足りる。

### 3.3 サーバーアクション

`app/attendance/actions.ts` に集約。既存 `overtime/actions.ts` と同名・同シグネチャを踏襲する。

```
// 申請作成
createAttendanceRequest(prev, formData) -> ActionResult
  ・formData.category を先頭で読み、カテゴリ別バリデータに分岐
  ・共通バリデーション：workDate 形式 / requestType / description 長さ
  ・カテゴリ別バリデータ（§4.4）
  ・paid_leave の場合は残日数チェック（サーバー側二重確認）
  ・prisma.$transaction で 「残日数再算定 → 不足なら reject → create」を1トランザクション

createResubmission(prev, formData) -> ActionResult
  ・既存パターン踏襲（parentId 必須、sent_back のみ許可、userId 一致確認）

withdrawRequest(formData) -> void
  ・既存パターン踏襲（submitted のみ、本人のみ）

// 承認
approveRequestAction(formData) -> void
rejectRequestAction(formData)  -> void
sendBackRequestAction(formData) -> void
  ・requireAdminOrDashboard で認可
  ・applyReview(id, reviewerId, nextStatus, comment) を共通化（残業と同じ形）
  ・approve 時、substitute_leave なら substituteForId の OvertimeRequest.category="holiday_work"
    が実在＆approved かをトランザクション内で再確認

// 有給付与
grantPaidLeave(formData) -> void
  ・requireManager
  ・userId / days(>0) / grantedOn / note を受け、PaidLeaveGrant を1件作成
  ・expiresOn = grantedOn + 2年（JST 0:00）
  ・source = "manual"

// 有給自動付与（バッチ or ログイン時トリガ）
runAutoPaidLeaveGrant(now) -> { granted: number, skipped: number }
  ・hireDate を持つ全アクティブユーザーを走査
  ・付与予定日（hireDate + 6ヶ月 / +1.5年 / +2.5年 / ...）が過去日で、
    かつ その予定日に該当する PaidLeaveGrant(source="auto") が未作成なら発行
  ・冪等：`@@unique([userId, grantedOn, source])` を PaidLeaveGrant に付ける
```

**認可**:
- 申請作成・取消：本人 (`requireSession`)
- 承認・差戻・却下：`requireAdminOrDashboard`（管理側 dashboard host からも通せる既存パターン）
- 手動有給付与：`requireAdminOrDashboard`
- 有給自動付与：バッチ用エンドポイント + 管理画面ボタン。冪等なので Vercel Cron から日次叩けば足りる（Phase 1 は「管理画面ボタン + admin ログイン時に非同期実行」でスタート）

**revalidatePath 対象**:
- `/attendance`（社員側履歴）
- `/attendance/paid-leave`（社員側 残日数）
- `/admin/attendance`, `/dashboard/attendance`
- `/admin/paid-leave`, `/dashboard/paid-leave`
- `/admin`, `/`（未対応件数・ホームの残日数）

### 3.4 画面

#### 3.4.1 社員側

| ルート | 役割 |
|---|---|
| `/attendance` | カテゴリ選択カード（8 種）+ 履歴一覧（20 件）+ 有給残バッジ |
| `/attendance/new` | カテゴリ選択 → `/attendance/new/[category]` へ導線 |
| `/attendance/new/[category]` | カテゴリ別フォーム（`AttendanceForm` を category prop で分岐） |
| `/attendance/[id]` | 詳細（既存 `overtime/[id]` と同構造）+ 取消 + 再申請 |
| `/attendance/paid-leave` | 有給残日数 + 過去付与・消化履歴 |

`/overtime` は残業と休日出勤のうち **残業のみ** 一覧（`category="overtime"` フィルタ）に絞る。休日出勤は勤怠申請側の「カテゴリ一覧」に集約する（後述 §5）。

#### 3.4.2 管理側 (`/admin/*`) と ダッシュボード側 (`/dashboard/*`)

| ルート | 役割 |
|---|---|
| `/admin/attendance` | 承認キュー。上部タブ：`すべて` / `休日出勤` / `欠勤` / `遅刻・早退・私用外出` / `有給` / `特別休暇` / `振替休暇` |
| `/admin/attendance/report` | 月次集計（後述 §5） |
| `/admin/paid-leave` | 有給付与フォーム + ユーザー別残日数一覧 + 過去付与履歴 |
| `/admin/settings/attendance` | 特別休暇の理由サジェスト・半休時刻・自動付与フラグ設定 |

`/dashboard/*` 側は既存 `dashboard/overtime` と同じく、`admin/attendance` の QueueRows / QueueCards をそのまま流用する（統括管理者用の鏡合わせ）。

#### 3.4.3 ホーム表示

`app/page.tsx` の `PunchPanel` 直上に、`PaidLeaveBadge` を挿入:

```
残X.X日  |  申請中Y日  |  失効まで最短ZZ日（＜30日でオレンジ警告）
```

タップで `/attendance/paid-leave` へ。既存 UI は壊さない。

#### 3.4.4 下部タブの扱い（**推奨案あり**）

**推奨: 既存「残業」タブを「申請」タブにリネームし、`/attendance` を指すようにする。**

理由（2 行）:
- 残業は「勤怠申請の 1 種」に落ちる位置づけ。タブを増やすとタブバーが 6 個になり狭くなる（現在 5 個）。
- `/attendance` トップから残業（→ 内部で category="overtime" のフィルタで /overtime）にも導線を張れば体感は劣化しない。

補足:
- ラベル: `残業` → `申請`
- href: `/overtime` → `/attendance`
- 既存 URL `/overtime` はそのまま生かす（外部リンクや通知のリンク互換のため）
- `/attendance` のトップに「残業を申請」「休日出勤を申請」「休暇を申請」の 3 グループカードを置く

**却下案**: タブを 6 個にする案 → タブが密で押しにくい / iOS Safari で下部の安全域を含めると更に窮屈。

### 3.5 承認フロー・reviewer・parent chain

- 状態遷移: `submitted → approved | rejected | sent_back`。差戻からの再申請で `parent` を新規行に張る（既存 `OvertimeRequest.parentId` と同じ）。
- reviewer: `applyReview` で `updateMany({ where: { id, status: "submitted" } })` を使う楽観ロック。既存パターン踏襲。
- コメント: 差戻・却下時のみ必須、200 文字上限（`REVIEW_COMMENT_MAX_CHARS` 流用）。承認時は不要。
- reviewer は `session.role in {manager, developer}` または dashboard cookie 保有者。既存の `requireAdminOrDashboard` + `resolveReviewerId` パターンをそのまま流用。

**substitute_leave 承認時の特別処理**:
- `substituteForId` が実在し、当該 `OvertimeRequest.category="holiday_work"` かつ `status="approved"` であることを承認トランザクション内で再確認。
- 承認済みの `substitute_leave` を後から「元の休日出勤」の側で取り消せなくする（次項 §7.3 の削除禁止で担保）。

---

## 4. 却下案と理由

### 4.1 休日出勤を別テーブルにする案
- 却下理由: 骨格が残業と完全同型で、UI (queue-rows)・集計 (overtime-aggregate)・reviewer の 3 箇所を二重実装することになる。
- category カラムでのフラグ分離はコスト最小で、既存 seed マイグレーションで既存全行に `"overtime"` を入れれば後方互換。

### 4.2 6 カテゴリを別テーブルに割る案
- 却下理由: reviewer / 再申請 chain / 状態機械 / 認可ゲートが完全同型。物理的に 6 テーブル切ると `Union` した承認キューが Prisma で書きにくく、月次集計も 6 パスになる。
- 差分は「単位」と「補足カラム 1〜2 個」で NULL 許容カラムに収まる。

### 4.3 有給残日数をカラム永続化（`User.paidLeaveRemaining`）する案
- 却下理由: 時効(expiresOn)到達で残が勝手に減るため、日次バッチが失敗すると即嘘の値になる。承認 / 差戻 / 手動付与ごとに更新漏れの事故源。
- 派生値は永続化しない（learnings 2026-07-19 mustFinishBy / 2026-07-20 走行残高と同判断）。負荷が上がってから「現在残高のみ後付けキャッシュ」を検討する。

### 4.4 半休を別カラム `isHalfDay: boolean` にする案
- 却下理由: 半休が「午前」「午後」で表示上・時刻定義上区別されるので情報が足りない。`paidLeaveKind: "full" | "am_half" | "pm_half"` の enum 相当が必要。leaveDays は 0.5 / 1.0 の数値、kind は表示・時刻導出のためのラベル、として分離した方が集計も画面も素直。

### 4.5 有給の付与と消化を同一テーブル（＋/−符号）で扱う案
- 却下理由: 消化は `AttendanceRequest.category="paid_leave"` の approve 済み行が既に真実源で、二重に持つと同期不整合が生じる。付与だけをテーブルに閉じ込め、消化はクエリで突合する非対称構造が保守しやすい。

### 4.6 substitute_leave の紐付けを自由文にする案
- 却下理由: 「どの休日出勤の振替か」を後から集計・重複防止（1 回の休日出勤で 2 回振替を弾く）するために構造的な外部キーが要る。自由文だと重複検知が不能。

### 4.7 「勤怠申請」タブを新設し「残業」タブを残す案
- 却下理由: §3.4.4 に記載。タブ密度と業務認知（残業も申請の一種）で「申請」統合が上位。

---

## 5. 業務ルールの厳密仕様

### 5.1 有給付与日数表（労基法・週所定 5 日以上のフルタイム前提）

| 継続勤続 | 付与日数 |
|---|---|
| 入社日 + 6ヶ月 | 10 日 |
| + 1年6ヶ月 | 11 日 |
| + 2年6ヶ月 | 12 日 |
| + 3年6ヶ月 | 14 日 |
| + 4年6ヶ月 | 16 日 |
| + 5年6ヶ月 | 18 日 |
| + 6年6ヶ月以降（毎年） | 20 日 |

- 週所定 4 日以下のパートは今回スコープ外（§6 参照）。
- 付与日は「hireDate + 上記月数」を JST 0:00 に丸めた日。
- 時効: `expiresOn = grantedOn + 2 年` の 0:00。当日 (`now < expiresOn`) までは有効。
- コード側は表を定数として持ち、`daysForGrantIndex(index: 0..∞)` の純関数で引く。

### 5.2 半休の時刻定義

- 既定: 午前休 = 08:00〜12:00 消化、午後半休 = 13:00〜17:30 消化
- `AppSetting.am_half_end_time` `pm_half_start_time` `pm_half_end_time` で全社変更可
- 個人単位の変更は Phase 2 送り（`User.defaultScheduledStartTime` で「その人の始業」だけ既に個別化）
- 半休は `leaveDays = 0.5`、`paidLeaveKind` で午前/午後を区別
- 同一日に「午前休 + 午後半休」の 2 件を出すと事実上全休 → 合計残日数の判定は日単位ではなく `sum(leaveDays)` で行うため自然に扱える

### 5.3 特別休暇 理由欄

- 必須。1〜200 文字（`codePointLength`）。空白のみ・改行のみは弾く。
- サジェスト（datalist）: `AppSetting.special_leave_reason_suggest` に "|" 区切りで保持。既定値: `"慶弔|結婚|忌引|災害|裁判員|健診|その他"`
- 選ばずに自由記述可

### 5.4 振替休暇の「元出勤日」記録方法

- `substituteForId` に承認済み `OvertimeRequest.id`（`category="holiday_work"` かつ `status="approved"`）を必須で紐付け。
- UI: 過去 90 日以内の自分の承認済み休日出勤をドロップダウンで選択。
- 同一 `substituteForId` に対する承認済み・申請中の `substitute_leave` が既にあれば新規申請を弾く（部分ユニーク相当 = サーバー側チェック、SQLite でユニーク制約が張れないので Server Action で担保）
- 却下・差戻・取消の後は再選択可

### 5.5 遅刻・早退の時刻バリデーション

- late:
  - `scheduledAt` < `startAt(実出勤)` を必須（実出勤が予定より遅い＝遅刻の定義）
  - 差 = `startAt - scheduledAt`。0 分ちょうど / 負は弾く
  - 差が 4 時間超 → 「遅刻ではなく欠勤/半休では？」の警告表示（弾かない）
- early_leave:
  - `startAt(実退勤)` < `scheduledAt(予定退勤)` を必須
  - 差 = `scheduledAt - startAt`。0 分ちょうど / 負は弾く
  - 差が 4 時間超 → 同上警告
- 上記の「4 時間超警告」はフォーム側のみ（サーバー側では弾かない。業務判断で許容されうる）

### 5.6 事前 vs 事後の日付制約

| category | pre 可 | post 可 | 追加制約 |
|---|---|---|---|
| holiday_work | ○ | ○ | 既存残業と同じ（当日中の事後まで） |
| absence | ○ | ○ | post は当日中のみ（過去日は弾く。「うっかり休んで翌日申請」を絶つ）→ **要相談**：現場運用では翌日以降の事後もありうる。**推奨: post は当日 + 前日1日まで許容**（過去 2 日以上は managerで手動介入） |
| late / early_leave / personal_out | ○ | ○ | post は当日中のみ |
| paid_leave | ○ | × | 事後は原則不可（当日直前まで pre で申請）。**例外: manager 権限のみ post を許可**（体調不良の事後承諾用） |
| special_leave | ○ | ○ | post は当日+前日まで |
| substitute_leave | ○ | ○ | post は 90 日以内（振替の期限） |

- pre: `workDate >= 今日 (JST)`。既存 overtime は「pre は startAt が未来」を見ていたが、日単位系はワークデート基準に統一。
- post: `workDate <= 今日 (JST)` + 上記の追加制約

上記 "**要相談**" の 2 点は運用開始後 1ヶ月で見直し。実装は `AppSetting.attendance_post_days_allowed` (default `"absence:1,late:0,early_leave:0,personal_out:0,paid_leave:0,special_leave:1,substitute_leave:90"`) の 1 行で制御できる形にしておく。

### 5.7 description / description の位置づけ

- 全カテゴリで任意 200 文字（`DESCRIPTION_MAX_CHARS` 流用）。
- special_leave の `reason` とは別物（reason は「休暇の種類=結婚/忌引 etc」、description は「補足=誰の結婚 etc」）

---

## 6. 既存への影響

### 6.1 `OvertimeRequest` に `category` を追加した影響

- **既存の一覧 (`/overtime`, `/admin/overtime`)**: `where.category = "overtime"` を必ず付ける（休日出勤を混ぜない）。マイグレーション時に既存全行を `"overtime"` に埋める seed を同梱。
- **月次集計 `overtime-aggregate.ts`**: 「残業の合計」は `category="overtime"` の approved のみ。「休日出勤の合計」は `category="holiday_work"` を分けて集計する新指標。
- **ホーム未対応件数**: 「未承認の残業申請」バナーは残業 + 休日出勤の合算件数に拡張し、内訳を副題に出す（例: `残業 3件・休日出勤 1件`）。
- **`/admin/overtime` 承認キュー**: 残業のみを扱う。休日出勤の承認は `/admin/attendance` の「休日出勤」タブに寄せる。**採用理由**: 承認画面が2枚に割れるが、月次帳票（残業時間 / 休日出勤日数）は集計が別物なので、承認画面もカテゴリで分けた方が管理者の混乱が少ない。

### 6.2 月次集計への影響

新規モデル `AttendanceRequest` を集計する `attendance-aggregate.ts` を追加。ユーザー別の月次サマリを以下の項目で持つ:

| 項目 | 対象 |
|---|---|
| 残業時間 | OvertimeRequest.category="overtime" approved のみ、durationMinutes 合計 |
| 休日出勤時間 | OvertimeRequest.category="holiday_work" approved のみ、durationMinutes 合計 |
| 欠勤日数 | AttendanceRequest.category="absence" approved の leaveDays 合計 |
| 遅刻回数 / 累計時間 | late approved の count / durationMinutes 合計 |
| 早退回数 / 累計時間 | early_leave approved の count / durationMinutes 合計 |
| 私用外出時間 | personal_out approved の durationMinutes 合計 |
| 有給消化日数 | paid_leave approved の leaveDays 合計 |
| 特別休暇日数 | special_leave approved の leaveDays 合計 |
| 振替休暇日数 | substitute_leave approved の leaveDays 合計 |
| 実勤務時間 | 既存 buildSessions からの合計 - (遅刻+早退+私用外出) |

**実勤務時間から遅刻等を差し引くのは Phase 1 の推奨だが、初期は「打刻の実測 = 実勤務時間」で回し、遅刻・早退は独立指標に留めるのも可**。ここは §8 未解決に。

### 6.3 未対応件数（`/admin` の警告バナー）

`AttendanceRequest.status="submitted"` の合算件数を追加。バナー文言を「未承認の勤怠申請が N 件（残業 X / 休日出勤 Y / 欠勤 Z / ...）」に拡張。

### 6.4 既存の残業承認画面と勤怠申請承認画面の関係（統合 vs 分離）

**採用: 分離。ただし `/admin` トップの「未承認バナー」で件数を合算し、両画面へリンクする**。

理由（2 行）:
- 残業/休日出勤は「時間単位・現場名・工数」中心、その他は「日単位・理由・時刻」中心で承認時に見るべき情報が異なる。
- 1 画面に統合するとフィルタが常時 8 個以上必要になり、承認速度が落ちる。

### 6.5 既存 URL 互換

- `/overtime`, `/overtime/new`, `/overtime/[id]`, `/admin/overtime`, `/admin/overtime/report`, `/dashboard/overtime` はそのまま維持。
- 内部で `category="overtime"` フィルタを追加するだけ。
- 通知・外部リンク・ブックマーク互換のため URL は変更しない。

---

## 7. 失敗モードと対策

### 7.1 時効切れ有給の判定タイミング

**採用: 申請時とホーム表示時にクエリで導出（バッチ不要）。**

- 導出関数 `getPaidLeaveBalance(userId, at: Date)` を純関数で作る。呼ばれるたび算出。
- 日次バッチは有給付与自動発行のみ（`runAutoPaidLeaveGrant`）。時効切れは「クエリ側で `now < expiresOn` の付与だけ足す」だけで自動的に反映される。
- バッチ失敗しても残日数表示は壊れない（付与のタイミングだけが遅れる。数分〜数日ズレても業務影響は軽微）

### 7.2 有給残日数の楽観ロック（二重消化防止）

**採用: サーバーアクションで `prisma.$transaction` に閉じ込め、create 直前に残再算定 → 不足なら reject する。**

- SQLite (libsql/Turso) は SERIALIZABLE 相当のロックを取れるので、同ユーザーの並列作成が同時に「残 1 日 → 各々 1 日消化 → 残 -1」になるのを防げる。
- クライアント側の表示だけでは信用しない。フォームで「残 1 日」と出ていても、送信時に別窓で 1 日消化済みなら reject する。
- reject 時のエラー文言は `残日数が不足しています（現在残 0.0 日 / 申請 1.0 日）`。フォームは差戻状態にならず「エラーバナー」で終わる。

### 7.3 承認済み申請の後追い削除禁止

- `withdrawRequest` は `status="submitted"` のみ削除許可（既存パターン踏襲）。
- 承認済み・差戻・却下は **物理削除禁止**。修正が必要なら「新規申請を出して古いのを reject する」運用。
- `substitute_leave` が承認済みの元 `OvertimeRequest`（休日出勤）は「取消」できない仕様にする（DB 制約ではなく Server Action の削除ガード）。
- 有給消化済みの `paid_leave` を後から `PaidLeaveGrant` 削除するのも禁止（管理側の「付与を取り消す」は grant.days をマイナスで打ち消す新規行を発行する監査可能な方式）

### 7.4 FIFO 割当と付与ごと消化の突合

- クエリ層で計算する。付与を古い順 (`grantedOn ASC`)、消化を新しい順 (`workDate DESC`) にソートし、消化を古い付与から食っていく（食えなくなったら次の付与へ）。
- FIFO の主目的は「時効ぎりぎりを先に潰す」こと。単純な `Σ - Σ` だと、古い付与が失効間近でも残側にカウントされる嘘表示になる。
- 時効間近 30 日以内の残がある場合、ホームバッジをオレンジで警告。

### 7.5 手動付与と自動付与の混在時の重複

- 自動付与は `@@unique([userId, grantedOn, source])` により同日重複を弾く。
- 手動付与は同日でも複数可（`source="manual"` は unique を実質貫通する。理由：管理者が「+1日足したい」等の細かい調整をするため）
- 誤発行の取消は「マイナス日数の grant」を発行することで対応。DB のレコードは残す（監査）

### 7.6 hireDate 未設定ユーザー

- `hireDate = null` のユーザーには自動付与を発行しない（バッチでスキップ）
- 管理画面「有給付与」で「hireDate 未設定 N 名」の警告を出す
- 手動付与のみで運用可能（旧来の紙管理からの移行用）

### 7.7 遅刻・早退時の時刻ロジック落とし穴

- late で `scheduledAt = 08:00`, `startAt = 08:00` (0 分遅刻) → **弾く**（遅刻ではない）
- 深夜勤務など日跨ぎで `scheduledAt` が `workDate` の翌日になるケースは Phase 2 送り（Phase 1 は 24 時間内で完結する予定時刻のみ受理）
- `personal_out` は勤務時間外 (startAt < 05:00 or endAt > 23:00) を警告表示

### 7.8 substitute_leave の重複チェック

- 承認前の重複: `substituteForId` 一致 + `status IN ("submitted","approved")` の他行があれば弾く。
- 承認後に前の承認を差戻す（reviewer が誤って承認→差戻）ケース: 差戻後は `status="sent_back"` になり重複条件から抜けるので、後続の申請が通せる。

### 7.9 SQLite (libsql) の CHECK 制約

- SQLite の CHECK 制約はマイグレーションで書けるが、Prisma でモデル定義できない。
- 「category=paid_leave のとき paidLeaveKind IS NOT NULL」等の意味制約は **Server Action のバリデータで担保**（DB 制約は指定しない）
- 意味制約は 1 箇所（`lib/attendance.ts` の `validateCreateAttendanceInput`）に集約。

---

## 8. 実装順序（依存の薄い順）

1. **Prisma スキーマ更新** — `User.hireDate` / `AttendanceRequest` / `PaidLeaveGrant` / `OvertimeRequest.category` 追加 + 既存レコードの category="overtime" 一括埋め seed
2. **共通 lib** — `lib/attendance.ts`（enum・バリデータ・カテゴリ別チェック）/ `lib/paid-leave.ts`（付与テーブル・残計算・FIFO） / `lib/attendance-aggregate.ts`（月次集計）
3. **サーバーアクション** — `app/attendance/actions.ts`（既存 `overtime/actions.ts` を雛形にコピー→拡張）
4. **社員側画面** — `/attendance` (カテゴリ選択+履歴) → `/attendance/new/[category]` → `/attendance/[id]` → `/attendance/paid-leave`
5. **管理側画面** — `/admin/attendance` (タブ付き承認キュー) → `/admin/paid-leave`（付与フォーム + 残日数一覧）
6. **ダッシュボード側画面** — `/dashboard/attendance` `/dashboard/paid-leave`（QueueRows 流用）
7. **ホーム / 下部タブ** — `PaidLeaveBadge` を `app/page.tsx` に追加 / `BottomTabBar.tsx` の残業タブを「申請」にリネーム
8. **未対応件数バナー** — `/admin` の集計拡張
9. **自動付与バッチ** — `runAutoPaidLeaveGrant` を「管理画面ボタン」で叩けるように。Cron 化は Phase 2

早期検証できる順: 1 → 3 → 2 の順にサーバー側だけまず通し、4 の画面はデータが入ってから作る。

---

## 9. スコープ外（Phase 2 送り）

- **全社カレンダー（祝日・会社休日）**: 休日出勤判定は「打刻がある土日祝」等の推論をしない。ユーザーが申請時に「今日は休日」と主張したかで判断。
- **代替勤務先の指定**: 振替休暇の勤務先変更は今回考慮しない（現場は基本自席）。
- **給与連携**: 給与計算システムへのエクスポートは今回スコープ外。月次集計のブラウザ表示 + CSV DL まで。
- **週所定 4 日以下パートの比例付与**: hireDate ベースのフル付与のみ。パート用テーブルは追加せず、管理者が手動付与で調整。
- **法定超月 45 時間・年 360 時間の残業上限アラート**: 月次集計に「今月の残業時間 / 上限まで」の表示は入れず、単純合計に留める。
- **深夜勤務・日跨ぎシフトの遅刻/早退**: `workDate` 内で完結する時刻のみ受理。
- **有給の 5 日取得義務チェック**: 年間 5 日未達アラートは Phase 2。
- **申請テンプレ・繰り返し申請**: 「毎週金曜半休」などの定型申請自動化は Phase 2。
- **メール/LINE 通知**: 承認/差戻/却下の通知は Phase 2（既存の残業と揃える）
- **モバイル署名/生体認証**: 承認時の追加認証は不要（既存の管理者ログインで担保）

---

## 10. 未解決事項

1. **absence の post 事後申請の許容日数**（§5.6）: 「当日+前日1日」を推奨としたが、現場の実態次第で 3〜7 日まで広げる要件が出うる。運用開始後 1ヶ月で決定。
2. **paid_leave の post 事後申請を manager だけ許すか、完全禁止か**（§5.6）: 体調不良で当日休 → 翌日 pre 扱いで代替（`workDate` を今日でなく休んだ日にする）を許すのが実態に近い。ここは manager 権限のみで許可する既定に。
3. **月次集計「実勤務時間」の遅刻・早退差引**（§6.2）: Phase 1 では独立指標のままにする案が優勢だが、給与連携時に問題になる可能性あり。要相談。
4. **自動付与のトリガ**: Vercel Cron を使うか、admin 画面の「今すぐ実行」ボタンだけで運用するか。Phase 1 はボタンで足りるが、hireDate の月次締めを見逃さないために Cron の方が堅い。
5. **substitute_leave の期限**: §5.6 で 90 日を仮置きしたが、業務規定で 60 日 or 30 日 の可能性あり。要就業規則確認。
6. **休日出勤申請の「休日」定義**: `workDate` が土日祝であることをフォームで軽く警告するか、ノーチェックにするか（祝日カレンダー不持ちなので厳密判定は無理）。Phase 1 はノーチェックが素直。
7. **付与日数表の 6.5 年目以降の 20 日固定** は労基法どおりだが、「20 日固定でよいか、それ以上を会社独自で付けたいか」は就業規則側の確認事項。
