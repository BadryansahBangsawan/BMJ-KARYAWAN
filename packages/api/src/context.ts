import type { createAuth } from "@BMJ-KARYAWAN/auth";
import type { Database } from "@BMJ-KARYAWAN/db";

type AuthSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>
>;

export type Context = {
  auth: null;
  session:
    | (AuthSession & {
        user: AuthSession["user"] & {
          role: "supervisor" | "kasir" | "mekanik";
        };
      })
    | null;
  db: Database;
};
