import type { createAuth } from "@BMJ-KARYAWAN/auth";
import type { Database } from "@BMJ-KARYAWAN/db";

export type Context = {
  auth: null;
  session: Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>;
  db: Database;
};
