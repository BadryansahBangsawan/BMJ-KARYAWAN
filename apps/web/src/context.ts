import type { Context as ApiContext } from "@BMJ-KARYAWAN/api/context";

import { getDb } from "./services";
import { createAuth } from "./services";

export async function createContext({ req }: { req: Request }): Promise<ApiContext> {
  const db = await getDb();
  const session = await (
    await createAuth(db)
  ).api.getSession({
    headers: req.headers,
  });
  return {
    db,
    auth: null,
    session: session as ApiContext["session"],
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
