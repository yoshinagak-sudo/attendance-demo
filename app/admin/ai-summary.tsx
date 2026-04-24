export function AiSummary({ text }: { text: string }) {
  return (
    <div className="ai-summary" role="status" aria-label="AIによる本日のサマリー">
      <div className="ai-body">
        <div className="ai-badge">
          <span className="ai-badge-dot" aria-hidden="true" />
          AI 今日のサマリー
        </div>
        <div className="ai-text">{text}</div>
      </div>
    </div>
  );
}
