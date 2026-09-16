export type UserRole = "supervisor" | "kasir" | "mekanik";
export function sessionRole(user: { role?: string } | undefined): UserRole {
  if (user?.role === "supervisor" || user?.role === "kasir") return user.role;
  return "mekanik";
}
