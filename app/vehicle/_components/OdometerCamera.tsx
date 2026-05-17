"use client";

import { Camera } from "lucide-react";
import { useRef, useState } from "react";

type Status = "idle" | "uploading" | "success" | "error";

export function OdometerCamera({
  onResult,
}: {
  onResult: (value: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setMessage("画像を解析中…");
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/vehicle/ocr", { method: "POST", body: fd });
      if (!res.ok) {
        setStatus("error");
        setMessage(`読み取りに失敗しました (${res.status})`);
        return;
      }
      const data = (await res.json()) as {
        odometer: number;
        confidence: "high" | "medium" | "low";
        reason: string;
      };
      if (data.odometer > 0) {
        onResult(data.odometer);
        const confLabel =
          data.confidence === "high"
            ? "✓ 確信度: 高"
            : data.confidence === "medium"
              ? "△ 確信度: 中（要確認）"
              : "⚠ 確信度: 低（手入力推奨）";
        setStatus("success");
        setMessage(`${data.odometer.toLocaleString()} km を読み取り。${confLabel}`);
      } else {
        setStatus("error");
        setMessage(`読み取れませんでした: ${data.reason}`);
      }
    } catch (err) {
      setStatus("error");
      setMessage("通信エラーが発生しました");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="vh-ocr-block">
      <button
        type="button"
        className="ot-btn-ghost ot-btn-block vh-ocr-btn"
        onClick={handleClick}
        disabled={status === "uploading"}
      >
        {status === "uploading" ? (
          "解析中…"
        ) : (
          <>
            <Camera
              width={16}
              height={16}
              strokeWidth={1.9}
              aria-hidden="true"
              focusable="false"
              style={{ verticalAlign: "-3px", marginRight: 6 }}
            />
            メーターを撮影して自動入力
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        style={{ display: "none" }}
      />
      {message && (
        <p
          className={`vh-ocr-msg vh-ocr-msg-${status}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      )}
    </div>
  );
}
