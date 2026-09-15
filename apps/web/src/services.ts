import { createAuth as createConfiguredAuth } from "@BMJ-KARYAWAN/auth";
import { type Database, createDb } from "@BMJ-KARYAWAN/db";

import { env } from "./env.server";

export function getDb(): Database {
  return createDb(env);
}
export async function createAuth(database?: Database) {
  return createConfiguredAuth(env, database ?? (await getDb()));
}
