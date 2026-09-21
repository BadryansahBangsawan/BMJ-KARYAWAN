import { createFileRoute } from "@tanstack/react-router";

import { env } from "../../env.server";
import { createAuth } from "../../services";

const RETRY_STATUSES = new Set([502, 503, 530]);
const MAX_IMAGE_CHARS = 80_000;
const THROTTLE_WINDOW_MS = 60_000;
const THROTTLE_MAX = 8;
const extractHits = new Map<string, number[]>();

function allowExtract(userId: string) {
  const now = Date.now();
  const times = (extractHits.get(userId) ?? []).filter((stamp) => now - stamp < THROTTLE_WINDOW_MS);
  if (times.length >= THROTTLE_MAX) {
    extractHits.set(userId, times);
    return false;
  }
  times.push(now);
  extractHits.set(userId, times);
  return true;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBaseUrl(url: string): string {
  let base = url.replace(/\/$/, "");
  if (base && !base.endsWith("/v1")) base = `${base}/v1`;
  return base;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        const record = part as { text?: unknown };
        return typeof record.text === "string" ? record.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function firstJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return source.slice(start, end + 1);
}

function completionText(payload: unknown): string {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const inner = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const choices = inner.choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return messageText(message?.content);
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export const Route = createFileRoute("/api/extract-struk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await createAuth();
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: "Authentication required" }, { status: 401 });
        }
        const role = session.user.role ?? "mekanik";
        if (role !== "mekanik" && role !== "supervisor") {
          return Response.json({ error: "Tidak boleh baca struk." }, { status: 403 });
        }
        if (!allowExtract(session.user.id)) {
          return Response.json({ error: "Tunggu sebentar sebelum scan struk lagi." }, { status: 429 });
        }

        let image: string | undefined;
        try {
          const body = (await request.json()) as { image?: string };
          image = body.image;
        } catch {
          return Response.json({ error: "Foto struk tidak valid." }, { status: 400 });
        }

        if (!image) {
          return Response.json({ error: "Foto struk kosong." }, { status: 400 });
        }
        if (image.length > MAX_IMAGE_CHARS) {
          return Response.json({ error: "Foto struk terlalu besar. Ambil ulang lebih dekat." }, { status: 413 });
        }

        const apiKey = asString(env.AI_API_KEY ?? process.env["AI_API_KEY"]);
        const baseUrl = normalizeBaseUrl(asString(env.AI_BASE_URL ?? process.env["AI_BASE_URL"]));
        const model = asString(env.AI_MODEL ?? process.env["AI_MODEL"]) || "AlwaysOn";

        if (!apiKey || !baseUrl) {
          return Response.json({ error: "AI baca struk belum dikonfigurasi." }, { status: 503 });
        }

        const dataUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
        const payload = JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 512,
          messages: [
            {
              role: "system",
              content: "Balas HANYA JSON valid, tanpa markdown.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: 'Dari foto resi/struk/nota, baca nomor struk/nota/invoice yang tercetak (label No, No., Nomor, Inv). Salin persis seperti di kertas. Tanggal nota YYYY-MM-DD jika ada. JSON saja: {"nomorStruk":"...","tanggal":"YYYY-MM-DD"}. Omit field yang tidak terbaca.',
                },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        });

        let lastStatus = 0;
        try {
          for (let attempt = 0; attempt < 3; attempt++) {
            let resp: Response;
            try {
              resp = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                },
                body: payload,
                signal: AbortSignal.timeout(45_000),
              });
            } catch (err) {
              const timedOut =
                err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
              if (attempt < 2) {
                await sleep(1000 * (attempt + 1));
                continue;
              }
              return Response.json(
                { error: timedOut ? "Baca struk habis waktu. Coba lagi." : "Gagal menghubungi AI baca struk." },
                { status: 502 },
              );
            }

            lastStatus = resp.status;
            if (resp.ok) {
              const data: unknown = await resp.json();
              const text = completionText(data);
              const jsonText = firstJsonObject(text);
              if (!jsonText) {
                return Response.json({ error: "Struk tidak terbaca. Isi uraian manual." }, { status: 422 });
              }
              let parsed: { nomorStruk?: unknown; tanggal?: unknown };
              try {
                parsed = JSON.parse(jsonText) as { nomorStruk?: unknown; tanggal?: unknown };
              } catch {
                return Response.json({ error: "Struk tidak terbaca. Isi uraian manual." }, { status: 422 });
              }
              const out: { nomorStruk?: string; tanggal?: string } = {};
              if (typeof parsed.nomorStruk === "string" && parsed.nomorStruk.trim()) {
                out.nomorStruk = parsed.nomorStruk.trim();
              }
              if (typeof parsed.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.tanggal)) {
                out.tanggal = parsed.tanggal;
              }
              if (!out.nomorStruk && !out.tanggal) {
                return Response.json({ error: "Struk tidak terbaca. Isi uraian manual." }, { status: 422 });
              }
              return Response.json(out);
            }

            if (!RETRY_STATUSES.has(lastStatus) || attempt === 2) {
              if (lastStatus === 429) {
                return Response.json({ error: "AI sedang sibuk. Coba lagi." }, { status: 429 });
              }
              if (lastStatus === 401 || lastStatus === 403) {
                return Response.json({ error: "AI baca struk ditolak. Cek konfigurasi." }, { status: 502 });
              }
              return Response.json({ error: "Gagal membaca struk. Coba foto lebih jelas." }, { status: 502 });
            }
            await sleep(1000 * (attempt + 1));
          }
        } catch {
          return Response.json({ error: "Gagal membaca struk." }, { status: 502 });
        }

        return Response.json({ error: "Gagal membaca struk." }, { status: 502 });
      },
    },
  },
});
