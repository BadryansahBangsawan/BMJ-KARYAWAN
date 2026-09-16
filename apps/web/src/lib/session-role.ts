export type UserRole = "supervisor" | "kasir" | "mekanik";
export function sessionRole(user: { role?: string } | undefined): UserRole {
  if (user?.role === "supervisor" || user?.role === "kasir") return user.role;
  return "mekanik";
}

export function roleLabel(role: string): string {
  if (role === "kasir") return "Kasir";
  if (role === "supervisor") return "Supervisor";
  return "Mekanik";
}
