import { createFileRoute } from "@tanstack/react-router";

import { env } from "../../env.server";

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

export const Route = createFileRoute("/api/extract-struk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let image: string | undefined;
        try {
          const body = (await request.json()) as { image?: string };
          image = body.image;
        } catch {
          return Response.json({ error: "invalid body" }, { status: 400 });
        }

        if (!image) {
          return Response.json({});
        }

        const apiKey = String(env.AI_API_KEY ?? process.env["AI_API_KEY"] ?? "").trim();
        const baseUrl = String(env.AI_BASE_URL ?? process.env["AI_BASE_URL"] ?? "")
          .trim()
          .replace(/\/$/, "");
        const model = String(env.AI_MODEL ?? process.env["AI_MODEL"] ?? "").trim() || "AlwaysOn";

        if (!apiKey || !baseUrl) {
          return Response.json({});
        }

        const dataUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

        try {
          const resp = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              temperature: 0,
              max_tokens: 256,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "image_url", image_url: { url: dataUrl } },
                    {
                      type: "text",
                      text: 'Dari foto struk/nota ini, ekstrak: (1) nomor struk/nota jika ada, (2) tanggal nota dalam format YYYY-MM-DD. Jawab hanya JSON: {"nomorStruk": "...", "tanggal": "YYYY-MM-DD"}. Jika tidak ditemukan, omit field tersebut.',
                    },
                  ],
                },
              ],
            }),
            signal: AbortSignal.timeout(45_000),
          });

          if (!resp.ok) {
            return Response.json({});
          }

          const data = (await resp.json()) as {
            choices?: Array<{ message?: { content?: unknown } }>;
          };
          const text = messageText(data.choices?.[0]?.message?.content);
          const jsonText = firstJsonObject(text);
          if (!jsonText) {
            return Response.json({});
          }

          const parsed = JSON.parse(jsonText) as {
            nomorStruk?: string;
            tanggal?: string;
          };
          const out: { nomorStruk?: string; tanggal?: string } = {};
          if (parsed.nomorStruk && typeof parsed.nomorStruk === "string") {
            out.nomorStruk = parsed.nomorStruk.trim();
          }
          if (parsed.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(parsed.tanggal)) {
            out.tanggal = parsed.tanggal;
          }
          return Response.json(out);
        } catch {
          return Response.json({});
        }
      },
    },
  },
});
