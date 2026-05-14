import { getSession } from "@/lib/session";
import { readOdometerFromImage } from "@/lib/odometer-ocr";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return new Response("expected multipart/form-data", { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) {
    return new Response("image required", { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return new Response("image too large", { status: 400 });
  }
  const mimeType = file.type || "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    return new Response("not an image", { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");

  try {
    const result = await readOdometerFromImage({ imageBase64: base64, mimeType });
    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "ocr failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
