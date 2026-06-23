/**
 * Slack 通知ヘルパー（Incoming Webhook 経由）
 *
 * - 環境変数 SLACK_FEEDBACK_WEBHOOK_URL が未設定なら no-op（ローカル開発で通知を出さない）
 * - fetch 失敗してもアプリ本体の挙動を壊さない（必ず catch → console.error）
 */
type SlackPayload = {
  text: string;
  blocks?: unknown[];
};

export async function postSlackFeedback(payload: SlackPayload): Promise<void> {
  const url = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  if (!url) {
    console.warn("[notify] SLACK_FEEDBACK_WEBHOOK_URL not set, skip");
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // Slack Webhook はレスポンス本文 "ok" を返す。短いので待つ。
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("[notify] slack non-2xx:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[notify] slack post failed:", e);
  }
}

export function buildImprovementMessage(args: {
  authorName: string;
  authorRole: string;
  body: string;
  improvementId: string;
  appUrl: string;
}): SlackPayload {
  const { authorName, authorRole, body, improvementId, appUrl } = args;
  const adminUrl = `${appUrl.replace(/\/$/, "")}/admin/improvements`;
  const roleLabel =
    authorRole === "developer"
      ? "開発者"
      : authorRole === "manager"
        ? "管理者"
        : "一般";

  // 本文は max 500 文字でカット表示（リンク先で全文確認）
  const trimmed = body.length > 500 ? `${body.slice(0, 500)}…` : body;

  return {
    text: `[ニナウ勤怠デモ] 改善依頼が届きました from ${authorName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📮 改善依頼が届きました", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*プロジェクト*\nニナウ勤怠デモ` },
          { type: "mrkdwn", text: `*投稿者*\n${authorName}（${roleLabel}）` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*本文*\n\`\`\`${trimmed}\`\`\`` },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `id: \`${improvementId}\` · <${adminUrl}|管理画面で開く>` },
        ],
      },
    ],
  };
}
