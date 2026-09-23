import type { QueryClient } from "@tanstack/react-query";

import { getUser } from "@/functions/get-user";

export const SESSION_QUERY_KEY = ["auth", "session"] as const;
export const SESSION_STALE_MS = 5 * 60 * 1000;
export const LOGIN_CONFIG_QUERY_KEY = ["auth", "login-config"] as const;

export type AppSession = NonNullable<Awaited<ReturnType<typeof getUser>>>;

let clientSession: { value: AppSession; at: number } | null = null;

export function readClientSession(): AppSession | null {
  if (typeof window === "undefined") return null;
  if (!clientSession) return null;
  if (Date.now() - clientSession.at >= SESSION_STALE_MS) return null;
  return clientSession.value;
}

export function writeClientSession(session: AppSession) {
  if (typeof window === "undefined") return;
  clientSession = { value: session, at: Date.now() };
}

export function clearSessionCache(queryClient?: QueryClient) {
  clientSession = null;
  queryClient?.removeQueries({ queryKey: SESSION_QUERY_KEY });
}

export function trpcRouterName(key: readonly unknown[] | undefined): string | undefined {
  if (!key || key.length === 0) return undefined;
  const path = key[0];
  if (Array.isArray(path) && typeof path[0] === "string") return path[0];
  if (typeof path === "string") return path;
  return undefined;
}

const ALSO_INVALIDATE: Record<string, string[]> = {
  kasbon: ["payroll"],
  job: ["payroll", "laporan"],
  attendance: ["payroll"],
  employee: ["payroll"],
};

export function invalidateMutationQueries(
  queryClient: QueryClient,
  mutationKey: readonly unknown[] | undefined,
) {
  const routerName = trpcRouterName(mutationKey);
  if (!routerName) return;
  if (routerName === "admin") {
    void queryClient.invalidateQueries();
    return;
  }
  const names = new Set([routerName, ...(ALSO_INVALIDATE[routerName] ?? [])]);
  void queryClient.invalidateQueries({
    predicate: (query) => names.has(trpcRouterName(query.queryKey) ?? ""),
  });
}
