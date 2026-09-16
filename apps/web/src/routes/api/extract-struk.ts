import { createFileRoute } from "@tanstack/react-router";

// Cloudflare Workers AI binding type (minimal)
interface CloudflareAI {
  run(
    model: string,
    input: {
      messages: Array<{
        role: string;
        content: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        >;
      }>;
    },
  ): Promise<{ response?: string }>;
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
          return new Response(JSON.stringify({ error: "invalid body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!image) {
          return new Response("{}", { headers: { "Content-Type": "application/json" } });
        }

        // Try to access Cloudflare AI binding (available in Workers runtime)
        const ai = (globalThis as unknown as { env?: { AI?: CloudflareAI } }).env?.AI;

        if (!ai) {
          // AI binding not configured — return empty gracefully; flow continues without auto-fill
          return new Response("{}", { headers: { "Content-Type": "application/json" } });
        }

        try {
          const result = await ai.run("@cf/meta/llama-3.2-11b-vision-instruct", {
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${image}` },
                  },
                  {
                    type: "text",
                    text: 'Dari foto struk/nota ini, ekstrak: (1) nomor struk/nota jika ada, (2) tanggal nota dalam format YYYY-MM-DD. Jawab hanya JSON: {"nomorStruk": "...", "tanggal": "YYYY-MM-DD"}. Jika tidak ditemukan, omit field tersebut.',
                  },
                ],
              },
            ],
          });

          const text = result.response ?? "";
          // Pull out the first JSON object the model may have wrapped in prose/markdown
          const jsonMatch = text.match(/\{[^}]*\}/s);
          if (!jsonMatch) {
            return new Response("{}", { headers: { "Content-Type": "application/json" } });
          }

          const parsed = JSON.parse(jsonMatch[0]) as {
            nomorStruk?: string;
            tanggal?: string;
          };
          const out: { nomorStruk?: string; tanggal?: string } = {};
          if (parsed.nomorStruk && typeof parsed.nomorStruk === "string") {
            out.nomorStruk = parsed.nomorStruk;
          }
          // Validate YYYY-MM-DD before trusting
          if (parsed.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(parsed.tanggal)) {
            out.tanggal = parsed.tanggal;
          }
          return new Response(JSON.stringify(out), {
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          // Graceful fallback — never surface errors to the client
          return new Response("{}", { headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});
