export { sessionRole, type UserRole } from "@BMJ-KARYAWAN/api/lib/domain";


export function coalesceAuthSession<S extends { user?: { role?: string } }>(
  live: S | null | undefined,
  routed: S | null | undefined,
): S | null {
  if (!live && !routed) return null;
  const user = { ...(routed?.user ?? {}), ...(live?.user ?? {}) };
  if (user.role !== "supervisor" && user.role !== "kasir" && user.role !== "mekanik") {
    user.role = routed?.user?.role;
  }
  return { ...(routed ?? live)!, ...(live ?? {}), user } as S;
}

export function roleLabel(role: string): string {
  if (role === "kasir") return "Kasir";
  if (role === "supervisor") return "Supervisor";
  return "Mekanik";
}
