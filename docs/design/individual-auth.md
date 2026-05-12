# 個別アカウント認証 導入設計

## 背景と目的

現状の butaifarm-attendance（Next.js 16 + Prisma 6 + libsql/Turso、本番 https://attendance-demo-dun.vercel.app）は **共有タブレット運用** を前提とし、打刻画面で名前ボタンをタップするだけで誰でも誰の名前でも打刻できる。商談デモには都合がよかったが、本番運用に近づける段階で「個別アカウントで勤怠管理する」要求が出た。

本書は「打刻・残業申請を本人しか操作できない」「管理画面は manager のみ」を実現する認証導入の設計を行う。実装には入らない。判断と落とし穴の事前列挙が目的。

### 既存資産と制約のおさらい

- `User.id = name` で運用中（cuid デフォルト宣言だが seed が `id: name` で upsert している）。`TimeRecord.userId` `OvertimeRequest.userId` `reviewerId` の3カ所から参照される
- 既存 PIN ガード（`lib/admin-auth.ts`）: HMAC-SHA256 署名つき Cookie、TTL 4時間、rate-limit 1分/IP 10回。`/admin/overtime` 配下のみ
- Next 16 で `middleware.ts` は `proxy.ts` に名称変更（既存にあり、Basic 認証は env 未設定で実質 no-op）
- Turso (libsql) + Vercel Serverless。打刻 API などサーバアクションは現状 Node ランタイム。Edge は使っていない
- 14名固定のニナウ社員シード（manager 6 / member 8）。当面 self-signup は不要

---

## 要件

### 機能要件

| ID | 内容 |
|---|---|
| F1 | ユーザーは ID + パスワードでログインし、Cookie セッションを得る |
| F2 | 打刻画面はログイン後「自分の名前ボタン1個＋大きな出退勤ボタン」に縮約。他人の名前は出さない |
| F3 | 残業申請は自分の userId 固定（`?actor=` クエリでの切り替え廃止） |
| F4 | 残業承認・管理ダッシュボード・設定（`/admin/*`）は `role = manager` のみ |
| F5 | `/login` 以外の全ページは未ログインなら `/login?next=...` にリダイレクト |
| F6 | ログアウトボタンを常設（ヘッダ） |
| F7 | 既存14名にパスワードを発行する移行手段（seed か、manager のみ操作できる管理画面）|
| F8 | 同一端末を「次の人に渡す」運用は許容（=明示的ログアウト → 再ログインで完結する）|

### 非機能要件

| ID | 内容 |
|---|---|
| N1 | Turso/libsql + Vercel で動く。Edge ランタイムには **依存しない**（Node ランタイムで動かす方が遥かに楽。後述）|
| N2 | パスワードハッシュは Web Crypto API ベース（PBKDF2 もしくは scrypt 系）。`bcrypt` は Node 専用なのでEdge互換を残すなら避ける。Node 専用にする場合は `bcryptjs` でも可 |
| N3 | Cookie は `httpOnly`, `Secure`(本番), `SameSite=Lax`, `Path=/`、TTL は推奨 12 時間 + sliding refresh |
| N4 | ブルートフォース対策（IP + userId 単位の rate-limit）|
| N5 | ログイン試行ログ（成功/失敗）をテーブルに残し、後追い調査可能にする |
| N6 | 本番ドメインで `SESSION_SECRET` 未設定だと **起動時 fail-fast**（demo-secret フォールバックを本番で踏むと一発死亡） |

### スコープ外

- パスワードリセット用メール送信（後述、Phase 2 で検討）
- 多要素認証 (TOTP/SMS)
- SSO (Google/Microsoft)
- 自分自身のパスワード変更画面（最初は manager が再発行する運用で十分）

---

## 採用案 — **A 案: 自前 ID + パスワード認証 (PBKDF2 + 署名 Cookie)**

### 案の比較

| 案 | 概要 | 立ち上げ | 本番運用への近さ | デモでの「すぐ触れる」 | 採否 |
|---|---|---|---|---|---|
| **A** | ID + パスワード（PBKDF2/scrypt）、Cookie セッション、既存 `lib/admin-auth.ts` の HMAC を流用して `session` Cookie を発行 | 中 | 高 | △（パスワード配布が必要） | **採用** |
| B | マジックリンク（メールアドレス宛にワンタイム URL）| 高 | 中（メール基盤要） | × (メール受信端末が要る) | 却下 |
| C | 簡易 PIN（社員ごとに4桁、入力後 Cookie に保存） | 低 | 低（衝突・総当たり耐性弱） | ○（既存延長） | 却下 |
| D | NextAuth.js / Auth.js（Credentials Provider） | 中 | 高 | △ | 却下 |

### なぜ A を選んだか

- **B（マジックリンク）**: 14名で7割が Gmail 非業務利用、共通アドレスやガラケーが混じる可能性。メール送信基盤（Resend / SES）と DKIM/SPF 設定が必要で、デモ商談中に「メールが届きません」事故が一番こわい。**「触れる」体験が劣化する** ので不採用。Phase 2 の「パスワード忘れリセット」用途で部分採用候補
- **C（4桁 PIN）**: 14名・4桁では衝突確率は無視できる（1/10000）が、**総当たり耐性が極端に弱い**（最大1万試行、rate-limit を抜くと数分）。さらに「個別アカウントで勤怠管理」という要求の本質は「他人が自分の名前で打てない」で、4桁 PIN は「他人が PIN を見えれば打てる」共有環境と地続きで思想がブレる。現状 `/admin` の PIN ガードはあくまで「管理画面ロック」という用途限定で生き残る価値はあるが、個人認証としては不採用
- **D（NextAuth.js / Auth.js）**: 14名固定・社外 OIDC 不要・self-signup 不要なら NextAuth はオーバースペック。`@auth/prisma-adapter` を入れて `Account` / `Session` / `VerificationToken` テーブルを足す導入コスト > 自前で書く Cookie 検証 100行 程度のコスト。**将来 Google OAuth を足す時にだけ NextAuth に乗せ替える**ロードマップで損はない（A → D 移行は session 検証層の差し替えだけで済む）
- **A（自前）**: 既存の `lib/admin-auth.ts` HMAC-Cookie パターンを **そのまま拡張** できる。Cookie ペイロードに `userId` と `role` と `exp` を入れれば session 化完了。新規依存ゼロ（`jose` も不要、Node `crypto` で完結）

### A 採用判断の合理性

| 視点 | A の評価 |
|---|---|
| デモで「すぐ触れる」 | パスワードカード（14名分の紙）を渡せばOK。マジックリンクのメール受信待ち時間ゼロ |
| 本番運用への移行コスト | 同じ仕組みで本番継続可。manager が他人のパスワードを再発行する画面を作れば完結 |
| 失敗時の影響範囲 | Cookie 1本に閉じる。DB スキーマ変更も `User` テーブルへの追加カラムのみ |
| Edge 移行余地 | PBKDF2 は Web Crypto API なので将来 Edge 化しても動く（Node `crypto` でも書ける、両対応の薄い wrapper で吸収） |
| Auth.js への乗せ替え | userId/role を持つ Cookie 検証関数を `auth()` 互換に差し替えるだけ。データモデルは `passwordHash` カラムが残るので Credentials Provider と直結 |

---

## データモデル

### `User` テーブル拡張

```prisma
model User {
  id                       String            @id @default(cuid())  // 既存（後述: id ポリシー）
  name                     String                                  // 既存（表示名）
  role                     String            @default("member")    // 既存

  // ★ 追加
  loginId                  String            @unique               // ログインID。半角英数 + ハイフン/アンダースコア、3-32文字
  passwordHash             String?                                 // PBKDF2-SHA256 + salt の JSON 文字列。null = 未発行
  passwordUpdatedAt        DateTime?                               // 強制再ログイン判定にも使う
  isActive                 Boolean           @default(true)        // 退職者を無効化（削除しない、申請履歴を残すため）
  lastLoginAt              DateTime?

  createdAt                DateTime          @default(now())
  records                  TimeRecord[]
  overtimeRequests         OvertimeRequest[] @relation("Applicant")
  overtimeReviewedRequests OvertimeRequest[] @relation("Reviewer")
  loginAttempts            LoginAttempt[]
}
```

#### `id` ポリシーの判断

**結論: 既存 `id = name`（日本語のフルネーム）は維持しない。cuid に切り替える。**

- 現状 `User.id` は `"髙山 澄人"` のような日本語文字列。これは URL クエリ（`?actor=...`）でも使われているが、`encodeURIComponent` で逃しているので動く。ただし **ログイン文脈で `userId` が漏れる場面（rate-limit キー、ログ）で日本語は扱いにくい**
- マイグレーションで `id` を作り直すと FK が全部追従するので影響が大きい。**初期切替コストはここで一度払う**価値がある
- 移行戦略は後述「マイグレーション戦略」に分離

#### `loginId` の命名規約

| 要件 | 詳細 |
|---|---|
| 文字種 | `^[a-z0-9_-]{3,32}$` （正規表現） |
| 一意性 | unique 制約 |
| 例 | `takayama`, `hoshi`, `mutoh` |
| デモ用初期値 | 名字をローマ字小文字（`髙山 澄人` → `takayama`、`比佐 京太` → `hisa`） |
| 衝突回避 | 同姓は番号付け（`mori1`, `mori2`）。今のシードでは森下が2名なので **要設計時調整** |

### `LoginAttempt` テーブル（新規）

```prisma
model LoginAttempt {
  id          String   @id @default(cuid())
  loginId     String                              // 失敗時もユーザーが特定できない場合に備え文字列保持
  userId      String?                             // ヒットしたら埋める
  user        User?    @relation(fields: [userId], references: [id])
  success     Boolean
  ip          String?                             // x-forwarded-for の先頭
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([loginId, createdAt])
  @@index([ip, createdAt])
  @@index([createdAt])
}
```

- 「最後の成功時刻」「直近 15 分の失敗回数」を計算するためのソース。テーブル化することで rate-limit ロジックを **プロセスを跨いで** 効かせられる（既存 `attempts` インメモリ Map は Vercel Serverless のコールドスタートで効かない）
- 保管は **90日でローテ**（旧データは別ログテーブルへ送るか単純削除）。打刻データと違って捨ててよい

### `Session` テーブルは作らない（stateless Cookie）

- 14名規模で1社運用、ログアウトは「Cookie 削除」で済むため stateless で十分
- 「特定ユーザーを全端末から強制ログアウト」要件が出たら `User.passwordUpdatedAt` を更新して Cookie ペイロードの `iat < passwordUpdatedAt` で弾く運用で吸収（=パスワード再発行＝強制ログアウト）
- DB セッションは将来 Auth.js に乗せ替える時に `Session` モデルを生やせばよい

### `AppSetting` 拡張

不要。認証パラメータは環境変数で持つ：

| ENV | 説明 | デフォルト |
|---|---|---|
| `SESSION_SECRET` | HMAC 署名鍵（base64、32 bytes 以上） | 起動時 fail（demo-secret フォールバックは廃止） |
| `SESSION_TTL_HOURS` | Cookie 有効時間 | `12` |
| `LOGIN_RATE_LIMIT_PER_15MIN` | userId 単位の失敗上限 | `8`（超えたらアカウントロック15分） |

---

## API 設計

### ルート一覧

| Method | Path | 認可 | 概要 |
|---|---|---|---|
| GET  | `/login` | unauth | ログインフォーム表示。authed なら `/` へリダイレクト |
| POST | `/api/auth/login` | unauth | ID/パスワード検証 → Cookie 発行 |
| POST | `/api/auth/logout` | authed | Cookie 削除 |
| POST | `/api/admin/users/[id]/password` | manager | パスワード再発行（ランダム文字列発行 → DB 保存 → 一度だけ表示） |
| POST | `/api/admin/users/[id]/role` | manager | ロール変更（任意、Phase 2） |
| POST | `/api/punch` | authed | 既存。**Body の `userId` は無視し、セッション userId を使う**（重要）|
| Server Actions | `app/overtime/actions.ts` の各 action | authed | 既存。**actor 由来の userId 検証を session に置換** |

### POST /api/auth/login

リクエスト:
```json
{ "loginId": "takayama", "password": "..." }
```

レスポンス:
```json
// 成功
{ "ok": true }
// 失敗
{ "ok": false, "error": "invalid_credentials" | "locked" | "rate_limited" | "invalid_payload" }
```

処理:
1. body parse、空チェック
2. IP + loginId で rate-limit（直近15分の失敗回数を `LoginAttempt` から count、閾値超なら 429）
3. `User.findUnique({ loginId })` で取得
4. 見つからない or `isActive=false` → 偽の hash と比較する **timing-safe ダミー** を回して `invalid_credentials`
5. `verifyPassword(hash, input)` で照合
6. 失敗 → LoginAttempt 記録 → `invalid_credentials`
7. 成功 → LoginAttempt(success=true) 記録 → `User.lastLoginAt` 更新 → Cookie 発行
8. **常に同じ応答時間（最低 200ms ウェイト）** で username enumeration を抑制

### Cookie ペイロード

```
base64url({
  uid: "ckxxxx...",       // User.id
  rl:  "manager",         // role (途中で変更されたら次回ログイン後反映)
  iat: 1715500000,         // 発行時刻 (秒)
  exp: 1715543200          // 失効時刻 (秒)
}).<HMAC-SHA256-signature>
```

- Cookie name: `att_session`（既存 `ot_admin` とは別、共存）
- `httpOnly`, `Secure`(本番のみ), `SameSite=Lax`, `Path=/`
- 検証は **expires + signature + `User.passwordUpdatedAt > iat` の3点**

### `verifyPassword` の実装イメージ（PBKDF2-SHA256）

```ts
// 保存形式: "pbkdf2-sha256$210000$<base64-salt>$<base64-hash>"
// iterations 210000 は 2024年 NIST/OWASP 推奨下限
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const iter = 210_000;
  const hash = pbkdf2Sync(plain.normalize("NFKC"), salt, iter, 32, "sha256");
  return `pbkdf2-sha256$${iter}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(stored: string, plain: string): boolean {
  const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2-sha256") return false;
  const iter = Number(iterStr);
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const got = pbkdf2Sync(plain.normalize("NFKC"), salt, iter, expected.length, "sha256");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
```

- NFKC で全角空白・記号の混入を無害化（パスワード貼り付け事故）
- 将来 Edge 移行時は `crypto.subtle.deriveBits({ name: "PBKDF2" })` で書き直せる（同一保存形式互換）

---

## 処理フロー

### ログインフロー

```
[ユーザー] -- GET /login --> [server]
                                  └ 既存 Cookie 検証 → 有効なら / にリダイレクト
[ユーザー] -- フォーム送信 --> POST /api/auth/login
   └ rate-limit check
   └ User.findUnique({ loginId })
   └ verifyPassword
   └ ok: Cookie 発行 + LoginAttempt(success=true) + User.lastLoginAt 更新
   └ ng: LoginAttempt(success=false) + 200ms 遅延 + 401
[ユーザー] -- 自動リダイレクト --> next=指定先 or "/"
```

### proxy.ts による粗粒度の認可

`proxy.ts` で **粗粒度のリダイレクト判定のみ** を行う。Cookie の HMAC 署名検証だけ Edge でやって、**DB アクセスはやらない**（Next 公式も「proxy で完全な session 管理をするな」と明記）。

```ts
// 疑似コード
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path.startsWith("/login")) return NextResponse.next();
  if (path.startsWith("/_next") || path.startsWith("/api/auth")) return NextResponse.next();

  const cookie = req.cookies.get("att_session")?.value;
  const decoded = cookie ? verifySignatureAndExpiry(cookie) : null;  // 署名+expのみ

  if (!decoded) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // /admin/* は manager のみ
  if (path.startsWith("/admin") && decoded.rl !== "manager") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
```

> **重要**: proxy.ts は Edge 実行。Node の `crypto` は使えないので Web Crypto API（`crypto.subtle`）で HMAC を再実装する。HMAC 検証だけは Edge 互換にする必要がある。**ハッシュ照合（PBKDF2）は Node ランタイムの API ルートでのみ走るので問題なし**

### サーバ側の細粒度認可（getSession 関数）

```ts
// lib/session.ts
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const cookie = store.get("att_session")?.value;
  if (!cookie) return null;
  const decoded = verifySignatureAndExpiry(cookie);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { id: decoded.uid } });
  if (!user || !user.isActive) return null;
  if (user.passwordUpdatedAt && new Date(decoded.iat * 1000) < user.passwordUpdatedAt) return null;
  return { id: user.id, name: user.name, role: user.role };
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login?next=" + encodeURIComponent("..."));
  return s;
}

export async function requireManager(): Promise<SessionUser> {
  const s = await requireSession();
  if (s.role !== "manager") redirect("/");
  return s;
}
```

- 各 page / Server Action の冒頭で `requireSession()` / `requireManager()` を呼ぶ
- **proxy だけに依存しない**（多重防御）

---

## 画面構成と動線

### `/login` （新規）

- フィールド: `loginId`（半角英数）/ `password`
- 「ログイン情報を忘れた場合は管理者まで」テキスト（Phase 1 ではリセット機能なし）
- フォームは `useActionState` ベース、Server Action で `/api/auth/login` を内部呼び出し
- ロゴ・大きめのタッチ領域（共有タブレットで指で押せるサイズ）

### `/` （打刻）変更点

| Before | After |
|---|---|
| 14人ぶんの名前グリッド | ログイン中の自分1名のカード（大きく）|
| 「タップで切替」グリッド | 「出勤」「退勤」の **巨大ボタン2つ**（または最新状態に応じて1ボタン）|
| 直近3件（全員） | 自分の直近3件 |
| ヘッダ右に「管理画面 →」 | 「[ユーザー名] ▾」メニュー（ログアウト、manager なら「管理画面」リンク）|

- 右上「次の人に渡す」ボタン = ログアウト遷移（`/login` へ）。明示的ボタンが鉄則（後述失敗モード）
- 「直近の打刻」は本人ぶんのみ表示。「ほかの人が今出勤中か」は管理ダッシュボードに分離

### `/overtime` 変更点

- 「申請者を選択」セクション **削除**
- `?actor=` クエリ削除（リンクから消す、来たら無視）
- すべて session.user 固定
- ヘッダに「[ユーザー名]」表示

### `/overtime/new`, `/overtime/[id]`, `/overtime/[id]` の再申請

- session.user.id を `userId` として固定。フォームから `userId` 入力を除去
- Server Action（`createOvertimeRequest` 等）で **body 経由の userId を信用しない**。session の userId で上書き
- `/overtime/[id]` の閲覧権: 「自分の申請」 OR `role=manager`。それ以外は 404 or `/` リダイレクト

### `/admin/*`

- middleware で manager 以外は `/` にリダイレクト
- 既存 `/admin/overtime/auth` の PIN ガードは **廃止**（個別認証で代替）
- 既存 `hasAdminAccess()` 呼び出しを全部 `requireManager()` に置き換え

### ヘッダ共通

```
[勤怠アプリ logo]                       [山田 太郎 ▾]
                                       ├ 管理画面（manager only）
                                       ├ 設定
                                       └ ログアウト
```

UI 実装は ui-designer に委譲（ブリーフ別添、後述）。

---

## 管理者の特権

| 操作 | manager | member |
|---|---|---|
| 自分の打刻 | ○ | ○ |
| 他人の打刻履歴 閲覧 | ○ | × |
| 他人の打刻 編集・削除 | △（Phase 2、現状なし） | × |
| 自分の残業申請 | ○ | ○ |
| 他人の残業申請 閲覧 | ○ | × |
| 他人の残業申請 編集 | ×（必ず本人が再申請） | × |
| 残業の承認・差戻 | ○ | × |
| `/admin/settings/overtime`（所定終業時刻・現場マスタ）| ○ | × |
| パスワード再発行（自分以外）| ○ | × |
| パスワード再発行（自分）| ○（manager は自分自身も再発行可） | × |
| `/admin/users`（ユーザー一覧・loginId 編集） | ○ | × |

**判断ポイント**:

- 「他人の打刻編集」を manager に許すと、勤怠改ざんの法的論点（労基法 109 条の保存義務）に踏み込む。**Phase 1 では一切認めない**（編集は audit 必須）。Phase 2 で `TimeRecord.editedBy`, `editedAt`, `editReason` を持って解放する設計余地は残す
- ガントチャートの可視性は manager 限定。現状 `/admin/page.tsx` で全員のガントが見えるが、これは manager だけが入る前提なのでそのまま

---

## マイグレーション戦略

### 課題: `User.id = name` → `cuid` 化

既存 14名は `id = "髙山 澄人"` のような日本語文字列が PK。これを cuid 化するには **FK を持つ全テーブルを連動させる必要** がある。

#### 案 M1: 一括書き換え（採用）

```sql
-- 1. 新カラム newId を追加し cuid を埋める
-- 2. TimeRecord / OvertimeRequest の userId, reviewerId を newId に更新
-- 3. 旧 id を退避（_legacyId に rename）
-- 4. newId を id に rename、PK 張り直し
```

Prisma migration では SQLite/libsql の PK 変更が直に出来ないため、**新テーブル作成 → コピー → 旧削除 → rename** の手順で書く。`prisma migrate dev` でなく **手書きの migration SQL** を一度書き、Turso にも同じものを流す。

順序:
1. ローカル `prisma/dev.db` でドライラン
2. Turso の本番 DB をブランチ機能で複製（Turso CLI `turso db shell` で `.dump` → 別 DB に流す）
3. 複製 DB で migration 実行・動作確認
4. 本番にメンテ告知（10分程度の打刻不可帯）
5. 本番に migration 適用
6. 既存 seed を再実行（idempotent）

撤退条件: 本番複製で `prisma generate && next build` が3回試行で通らない場合、id 変更を一時保留し **`loginId` だけ追加して既存 id を残す**（次善策、後述）

#### 案 M2: id は触らず loginId だけ追加（次善案）

- `User.id` は日本語のまま、`loginId` を新規 unique 列として追加
- 認証は loginId、その他参照は既存 id のまま
- メリット: マイグレーション軽量（追加カラム + index 1個）
- デメリット: rate-limit キーや LoginAttempt.userId が日本語化、ログが読みにくい
- 採用条件: M1 が現実的でないと判明した場合のみ

#### 案 M3: 既存 User を全削除して再 seed

- メリット: 一番きれい
- デメリット: `TimeRecord` / `OvertimeRequest` が `onDelete: Restrict` なので **削除できない**。打刻ログを捨てれば可能だが、商談デモ用とはいえ既に本番運用に近い使い方をしている可能性があり危険
- **不採用**

### 課題: 初期パスワード発行

#### 案 P1: seed にハードコード → デモ全員同じ「`butaifarm2026`」を埋め込む

- メリット: ゼロ手間
- デメリット: 「個別認証」を装って全員同じパスワード = 認証の体をなさない。商談説明で論破される
- **不採用**

#### 案 P2: seed が乱数で発行 → コンソール出力（採用）

```ts
// prisma/seed.ts 拡張
for (const u of USERS) {
  const tmp = randomPasswordHumanFriendly(); // 例: "fox-mint-12"
  const hash = hashPassword(tmp);
  await prisma.user.upsert({
    where: { loginId: u.loginId },
    update: { passwordHash: hash, passwordUpdatedAt: new Date() },
    create: { ...u, passwordHash: hash, passwordUpdatedAt: new Date() },
  });
  console.log(`${u.name.padEnd(8)}  loginId=${u.loginId.padEnd(10)}  password=${tmp}`);
}
```

- 出力をターミナルから紙にコピペして配布
- `randomPasswordHumanFriendly` は dictionary word × 2 + 数字2桁 で覚えやすく（例: `fox-mint-12`）
- 乱数性は十分（dictionary size 200^2 × 100 = 400万通り、初期配布用途で 14名なら衝突確率は実用上ゼロ）
- 配布後、各自が `/profile/password` で変更（Phase 2）。Phase 1 は初期パスワード固定運用

#### 案 P3: `/admin/users` 画面から manager が「パスワード再発行」を押す（推奨追加）

- P2 でデモを開始しつつ、ニナウ社内で再発行が必要になった時のため `/admin/users` を実装
- 再発行ボタン → 新パスワードを **1回だけ画面に表示**（コピーボタン付き）。DB には hash のみ
- これを Phase 1 のスコープに含めると安全（後述: 「パスワード忘れ → 管理者対応」の運用が成立する）

---

## proxy.ts との関係

| 現状 | After |
|---|---|
| Basic 認証（`BASIC_AUTH_USER`/`BASIC_AUTH_PASS`、現状OFF）| **廃止** |
| `/admin/overtime/auth` の PIN ガード（HMAC Cookie）| **廃止**（個人認証 + role で代替）|
| middleware matcher: 全パス | proxy matcher: 全パス、内部で `/login` `/_next` `/api/auth` を除外 |

- 「ステージング限定で Basic 認証」が後から欲しくなる可能性はある → `STAGING_BASIC_AUTH=on` フラグで条件分岐できる薄い層を proxy に残す（数行）
- 既存 `lib/admin-auth.ts` は **`/admin/overtime/auth` ページ・PinForm・PIN route と共に削除候補**。ただし `rateLimit` ユーティリティだけは `LoginAttempt` テーブル化までの繋ぎで再利用可（最終的には不要）

---

## 既存 `?actor=<userId>` クエリの扱い

`?actor=` が使われている箇所一覧（Grep 結果より）:

| ファイル | 用途 | 変更後 |
|---|---|---|
| `app/overtime/page.tsx` | 申請者選択 + 履歴フィルタ | actor 廃止、session.user で固定 |
| `app/overtime/new/page.tsx` | 新規申請の userId | session.user で固定、UI は actor 表示削除 |
| `app/overtime/new/overtime-form.tsx` | userId hidden input | hidden input 削除（server action 側で session 参照）|
| `app/overtime/[id]/page.tsx` | actor で「自分の申請か」判定 | session.user.id == request.userId で判定 |
| `app/overtime/[id]/resubmit-form.tsx` | 再申請 userId | 同上、session で上書き |
| `app/overtime/actions.ts` | `withdrawRequest`, `createOvertimeRequest`, `createResubmission` | `userId` を formData から無視し session から取得。改ざん試行は 403 |

**重要な落とし穴**:

- 現状 `withdrawRequest` は `formData.get("userId")` と `target.userId` を比較しているが、formData は **クライアント任意改ざん可** なので意味がない。session.user.id でなければならない（既存バグでもある）
- `createResubmission` の parent.userId と session.user.id の一致を必須化（manager でも他人の再申請は不可、本人のみ）

---

## 失敗モード

### F1. パスワード忘れ（最頻発）

- **検知**: ユーザーから manager への口頭/Slack
- **対策**: `/admin/users` の「パスワード再発行」ボタン → 新パスワード1回表示 → 紙で渡す
- **Phase 2**: メールリセット導入（要メール送信基盤）

### F2. ブルートフォース攻撃

- **検知**: `LoginAttempt` の同一 IP / loginId で失敗 8 回 / 15分
- **対策**: 当該 loginId を15分自動ロック（429 を返す）。IP 単位でも同様（30回/15分）
- **副作用**: 正規ユーザーが連続失敗すると自分でロックする → 「管理者に連絡」で manager がロックを **明示解除** できる UI を `/admin/users` に置く（`LoginAttempt` から該当行を `voidedAt` で無効化）

### F3. セッション固定 (Session Fixation)

- **対策**: ログイン成功時に **必ず新しい session Cookie を発行**（古い値を破棄して再発行する仕草を明示）。stateless Cookie なので session ID 固定は実質できないが、念のため `exp` と `iat` を必ず更新

### F4. 共有端末でのログアウト忘れ

- **対策1**: 打刻ボタン直後に「次の人に渡す」ボタンを **目立つ位置に常設**
- **対策2**: アイドル30分でクライアント側自動ログアウト（fetch `/api/auth/logout` してから `/login` リダイレクト）
- **対策3**: 起動時に「最終アクセスから2時間経過していたら強制ログイン画面」（server 側で `iat` 古ければ再認証）
- **落とし穴**: 「次の人に渡す」を **明示的押下** にしないと、現場で「いつもの〇〇さんのまま打刻」事故が起きる。**自動ログアウトと明示ログアウトの両方** が必要

### F5. Cookie の SameSite / Secure 設定

- 本番 (Vercel): `Secure=true`, `SameSite=Lax`
- ローカル開発: `Secure=false`（localhost で Secure を立てると Chrome 以外で Cookie が落ちる）
- 判定は `process.env.NODE_ENV === "production"` + `request.headers.get("x-forwarded-proto") === "https"` の両方
- **落とし穴**: Vercel preview deployments は `*.vercel.app` で動くため、`SameSite=None; Secure` にしない限り iframe 埋め込みで切れる。preview からの埋め込みは想定していないので Lax で固定でOK

### F6. 本番 vs ローカルでの secret 差異

- **落とし穴**: 既存 `lib/admin-auth.ts` の `demo-secret-do-not-use-in-prod` フォールバックが本番に残る運用事故が起きやすい
- **対策**: 起動時に `process.env.SESSION_SECRET` が未設定かつ `NODE_ENV === "production"` なら `throw` で **fail-fast**。`vercel.json` か `next.config.ts` ロード時にチェック

### F7. Turso（libsql）のレプリケーション遅延

- **状況**: Turso は libsql の embedded replica を使うとリージョン跨ぎで数百ms 遅延がある
- **影響**: パスワード変更直後の旧 Cookie がしばらく通る可能性（`passwordUpdatedAt` のチェックがレプリカで古い値を返す）
- **対策**: パスワード変更操作は **primary に直接書き、書いた直後に Cookie を強制 invalidate**（クライアントに Set-Cookie: max-age=0）。読み側は遅延を受容（数秒で収束）
- **重要度**: 14名規模で攻撃面はほぼゼロ、Phase 1 では受容

### F8. Edge ランタイムでの crypto 互換

- proxy.ts は Edge 実行 → Node `crypto` 不可
- HMAC 検証は Web Crypto API で書き直す（`crypto.subtle.verify`）
- **落とし穴**: 既存 `lib/admin-auth.ts` は `node:crypto` を直接 import している。proxy で同じファイルを import すると **build エラーになる可能性**（Next 16 では tree-shake が効くが、保守を考えると分離が安全）
- **対策**: `lib/session-edge.ts`（Web Crypto API、proxy 専用）と `lib/session-node.ts`（Node crypto、API ルート専用）に分離

### F9. パスワード hash の iteration 数下方互換

- 将来 iter を 210000 → 600000 に上げたくなる
- 保存形式に `iter` を含めているので、verify 時はその値で再計算 → 比較成功時に最新 iter で再保存（lazy upgrade）
- **Phase 1 では実装しない**、コメントに「upgrade-on-verify を将来実装」と残す

### F10. CSRF（Server Action / form 経由）

- Next 16 Server Action は **同一 origin POST + Cookie** が前提。`SameSite=Lax` で他サイトからの form submit は防げる
- ただし `/api/punch` のような JSON API ルートは外部から叩ける → **必ず session Cookie 検証 + 同一 origin チェック**（Origin/Referer ヘッダ照合）を入れる
- **落とし穴**: モバイルブラウザの一部で Referer が落ちる → Origin ヘッダ優先で照合、欠落時は同一ホストとみなす保険

### F11. timing attack（loginId 列挙）

- 未登録 loginId と登録済み loginId で応答時間が違うと「どの loginId が存在するか」が漏れる
- **対策**: 未登録時もダミー hash（事前計算済み定数）と比較し、最終応答も同程度の latency にする
- 加えて「成功も失敗も最低 200ms 待つ」共通遅延

### F12. CSV エクスポートからのパスワード漏洩

- `LoginAttempt` テーブルに **平文パスワードを絶対に保存しない**（試行値そのものはログしない）
- CSV エクスポート機能（既存 admin 配下）に `User.passwordHash` が混入しないよう、エクスポート用 type を明示する

---

## 実装順序

依存の薄い順、早期検証できる順に並べる。

### M1: スキーマ + ハッシュユーティリティ + seed

1. `prisma/schema.prisma` に `loginId`, `passwordHash`, `passwordUpdatedAt`, `isActive`, `lastLoginAt` を追加
2. `LoginAttempt` モデル追加
3. `lib/password.ts`（hash/verify）を実装、unit テスト（Node の `node:test`）で hashPassword/verifyPassword の往復一致を検証
4. `lib/session-node.ts` で Cookie 発行・検証（既存 `lib/admin-auth.ts` のロジック移植）
5. `lib/session-edge.ts` で Web Crypto API 版の検証関数（署名と exp のみ）
6. `prisma/seed.ts` を `loginId` 付与 + 初期パスワード乱数発行に書き換え
7. ローカルで seed 実行 → 出力されたパスワードでログイン手動テスト（API routeはまだ無いのでハッシュ照合だけ unit test）

**完了条件**: `npm run build` 通過 + `node --test lib/password.test.ts` 全 pass

### M2: 認証エンドポイント + login 画面

1. `app/api/auth/login/route.ts`（POST）
2. `app/api/auth/logout/route.ts`（POST）
3. `app/login/page.tsx` + `app/login/login-form.tsx`（ui-designer ブリーフ済の状態で着手）
4. `lib/session.ts` の `requireSession()` / `requireManager()`

**完了条件**: `/login` で実際にログイン→Cookie 発行→`/` 遷移、ログアウトで Cookie 削除を E2E（playwright）で確認

### M3: proxy.ts + 既存ページの認可挿入

1. `proxy.ts` を全面書き換え（Basic 認証廃止、session 検証）
2. 各 page.tsx の冒頭に `requireSession()` を追加
3. `/admin/*` の page.tsx は `requireManager()` に置換
4. `app/overtime/actions.ts` の各 server action で `requireSession()` + userId 上書き
5. `/api/punch` で session 検証 + body の userId を破棄して session userId 採用

**完了条件**: 未ログインで `/` にアクセス → `/login?next=%2F` にリダイレクト。member で `/admin` にアクセス → `/` にリダイレクト

### M4: 画面変更（actor 廃止、ヘッダ刷新）

1. `/`（PunchPanel）の自分専用化
2. `/overtime` の actor 選択削除
3. `/overtime/new`, `/overtime/[id]` の userId 固定
4. `/admin/overtime/auth/*` の削除、`hasAdminAccess()` 呼び出し全箇所を `requireManager()` に置換
5. 共通ヘッダコンポーネント（ユーザー名 + ログアウト + manager 用リンク）

**完了条件**: 各画面の動作テスト、`?actor=` を付けても無視される

### M5: 管理者向けユーザー管理

1. `/admin/users` page（一覧 + 「パスワード再発行」ボタン）
2. `/api/admin/users/[id]/password` route
3. 失敗ログイン履歴の閲覧 UI（オプション、Phase 2 でも可）

**完了条件**: manager がパスワード再発行 → 旧 Cookie 自動失効 → 新パスワードでログインできる

### M6: 失敗モード対策仕上げ

1. アイドル30分自動ログアウト（client component）
2. fail-fast: `SESSION_SECRET` 未設定で起動エラー
3. timing-safe ダミー比較
4. CSRF: Origin ヘッダ照合
5. `LoginAttempt` の90日ローテーション（GitHub Actions Cron か、別途）

### M7: 本番移行

1. Turso 本番 DB のスナップショット
2. migration を staging Turso で適用→動作確認
3. メンテ告知後、本番 Turso に migration 適用
4. 本番 Vercel に `SESSION_SECRET` ほか env を設定 → デプロイ
5. 初期パスワードを紙で配布
6. PIN 関連 env（`OVERTIME_APPROVER_PIN`, `OVERTIME_APPROVER_SECRET`）と Basic 認証 env をクリーンアップ

---

## ui-designer へのブリーフ要点

実装の見た目は ui-designer に任せる。最低限の要件：

1. **`/login` ページ**
   - 大時計あり（既存打刻画面の文化を踏襲）
   - フィールドは 2 つ（loginId / password）、タブレットでも押しやすいサイズ
   - エラー時に「ログイン情報が正しくないか、ロックされています」のみ表示（user 列挙防止）
   - 「管理者にお問い合わせください」リンク（mailto は付けない、案内テキストのみ）

2. **打刻画面（`/`）の縮約版**
   - ユーザー名カード（中央、大）
   - 巨大な「出勤」/「退勤」ボタン1個（状態に応じて切替）
   - 「次の人に渡す（ログアウト）」を **画面下部に常設、目立つ赤系**
   - 「本日の自分の打刻履歴」リスト

3. **共通ヘッダ**
   - 左: アプリ名
   - 右: 「[名前] ▾」プルダウン → 管理画面（manager only） / ログアウト

4. **`/admin/users`**
   - 表形式（名前 / loginId / role / 最終ログイン / 状態 / アクション）
   - 「パスワード再発行」モーダル: 新パスワードを1回だけ表示、コピーボタン、閉じると2度と見れない注意書き

5. **トーン**
   - 既存 `app/globals.css` のトークンを使用（plain CSS、Tailwind 不採用）
   - 共有タブレット運用なので **指タッチ前提のサイズ感**（最小タップ領域 44x44 以上）

---

## 未解決事項

1. **同姓のユーザー（森下加奈・森下陽奈）の loginId 衝突回避ポリシー**: `morishita_kana` / `morishita_haruna` か、`kana_m` / `haruna_m` か。ui-designer ではなく社長（ニナウ）に最終確認すべき
2. **「自分のパスワード変更」画面 (`/profile/password`) を Phase 1 に含めるか**: 含めれば運用負荷が下がる（manager 介在不要）。仕様は単純（現在パスワード + 新パスワード×2、PBKDF2 で再 hash）。**Phase 1 に含めることを推奨**するが、スコープ判断は社長
3. **退職者の扱い**: `isActive=false` で無効化までは決めたが、過去申請の「申請者」表示で〇〇（退職）と出すか名前そのままか。デモでは想定不要、本番運用前に決める
4. **manager 自身が自分を `isActive=false` にできてしまう事故防止**: 最後の manager を無効化しようとしたら拒否するチェックが必要。Phase 1 で 1 行のガード追加（`User.count({ role: "manager", isActive: true }) > 1` を満たさない場合 deny）
5. **「次の人に渡す」を明示ボタンで運用するか、自動ログアウトとの併用にするか**: F4 で両方挙げたが、デモで現場の反応を見て微調整する余地。設計としては両方実装する前提
6. **Phase 2 のメールリセット導入時のメール送信基盤**: Resend / SES / Postmark のどれにするかは researcher 案件。ニナウ社のドメイン管理状況に依存
7. **`User.id` cuid 化と Turso migration の所要メンテ時間**: ステージング Turso が手元にあるか確認。なければ本番複製手順を確立してから本番反映

---

## 撤退条件

- M1 のスキーマ migration を staging で適用しても 3 回試行で復旧不能 → **M2 を `User.id` 維持パターン（次善案 M2）に切替**
- M2 完了後、ログイン-打刻一連で 200ms × 5 回試して 3 回以上 500 ms 超 → Turso レプリカ遅延の影響を疑い、パスワード照合だけ in-memory cache（5 分 TTL）を入れる
- 本番投入後、24 時間以内に 3 件以上の「ログインできない」報告 → 一時的に PIN ガード復活させて打刻を継続できるエスケープハッチを残す（`AUTH_MODE=fallback_pin` 環境変数）

---

## 参考実装ヒント

- Next 16 公式 authentication guide（`node_modules/next/dist/docs/01-app/02-guides/authentication.md`）が `useActionState` + Server Action + Jose JWT で完結する例を提供しており、ほぼそのまま参考にできる
- ただし本設計は Jose を使わず Node `crypto` 直接（既存 `admin-auth.ts` のスタイル踏襲）でシンプル化している。Jose 導入コストを払うのは Auth.js 移行と同時で十分
- bcrypt 系のライブラリは導入しない（PBKDF2 で十分、Web Crypto 互換、依存ゼロ）
