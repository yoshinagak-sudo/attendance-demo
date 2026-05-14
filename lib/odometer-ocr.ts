import { GoogleGenAI, Type } from "@google/genai";

const MODEL = "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = `あなたは車両のオドメーター（走行距離計）の数字を画像から正確に読み取るAIです。

## 読取ルール
- 画像に写っているメーターの **積算走行距離（ODO / TOTAL）** を読み取って整数で返す
- トリップメーター（TRIP A / TRIP B）と間違えない。最も大きい桁数の数字を採用
- 小数点以下は無視（一の位の右側の数字は捨てる）
- 数字が完全に判読できない場合は confidence を low にし、reason に理由を書く
- 数字が斜めの・暗い・ぼやけている場合は confidence を low

## 出力
- odometer: 整数（読み取れない場合は0）
- confidence: "high" | "medium" | "low"
- reason: 1〜2文の所見`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    odometer: { type: Type.INTEGER, minimum: 0 },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
    reason: { type: Type.STRING },
  },
  required: ["odometer", "confidence", "reason"],
  propertyOrdering: ["odometer", "confidence", "reason"],
};

export type OdometerOcrResult = {
  odometer: number;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export async function readOdometerFromImage(args: {
  imageBase64: string;
  mimeType: string;
}): Promise<OdometerOcrResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: "この画像から積算走行距離(ODO)を整数で読み取ってください。" },
          { inlineData: { mimeType: args.mimeType, data: args.imageBase64 } },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.1,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned empty response");
  return JSON.parse(text) as OdometerOcrResult;
}
