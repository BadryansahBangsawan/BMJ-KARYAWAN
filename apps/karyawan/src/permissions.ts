import seed from "./config/bmj.json";

export type Permission =
  | "absenSelf"
  | "absenRoster"
  | "kasbonCreate"
  | "kasbonApprove"
  | "kasbonReject"
  | "kasbonDisburse"
  | "kasbonPay"
  | "jobCreateSelf"
  | "jobCreateAny"
  | "jobAccept"
  | "jobCancel"
  | "storeCreate"
  | "payrollViewSelf"
  | "payrollViewAll"
  | "payrollRebuild"
  | "employeeRead"
  | "employeeWrite"
  | "laporanView"
  | "announcementRead"
  | "announcementWrite"
  | "leaveCreate"
  | "leaveApprove"
  | "roleManage"
  | "settingsWorkshop";

export type AppRole = {
  id: string;
  label: string;
  isSystem: boolean;
  permissions: Permission[];
};

export type FeatureModule = {
  id: string;
  label: string;
  icon: string;
  path: string;
  navOrder: number;
  enabled: boolean;
  anyOf: Permission[];
};

export type WorkshopConfig = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  radiusM: number;
  maxAccuracyM: number;
  tz: string;
  locale: string;
  apiBase: string;
  seedPrimary: string;
  workWeekdays: number[];
  clock: {
    hadirStart: string;
    hadirEnd: string;
    telatEnd: string;
    setengahEnd: string;
  };
  roles: AppRole[];
  modules: FeatureModule[];
};

export const config = seed as WorkshopConfig;

export function roleById(id: string): AppRole {
  return (
    config.roles.find((role) => role.id === id) ??
    config.roles.find((role) => role.id === "mekanik") ??
    config.roles[0]
  );
}

export function navFor(role: AppRole): FeatureModule[] {
  return config.modules
    .filter((module) => module.enabled)
    .filter(
      (module) =>
        module.anyOf.length === 0 ||
        module.anyOf.some((permission) => role.permissions.includes(permission)),
    )
    .slice()
    .sort((a, b) => a.navOrder - b.navOrder);
}

export const apiCatalog = {
  authSignInEmail: "/api/auth/sign-in/email",
  authSignOut: "/api/auth/sign-out",
  authGetSession: "/api/auth/get-session",
  trpc: "/api/trpc",
  healthCheck: "healthCheck",
  forbiddenSupervisor: "Supervisor only",
  forbiddenKasirOrSupervisor: "Kasir or supervisor only",
  forbiddenKasir: "Kasir only",
} as const;
