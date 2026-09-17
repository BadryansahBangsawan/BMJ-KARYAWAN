import { createServerFn } from "@tanstack/react-start";

import { env } from "../env.server";

export const getLoginConfig = createServerFn({ method: "GET" }).handler(async () => {
  const fromWorker = env.GOOGLE_CLIENT_ID.trim();
  const fromProcess = (process.env["GOOGLE_CLIENT_ID"] ?? "").trim();
  return { googleClientId: fromWorker || fromProcess };
});
