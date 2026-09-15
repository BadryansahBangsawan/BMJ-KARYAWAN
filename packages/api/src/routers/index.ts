import { publicProcedure, router } from "../index";

import { adminRouter } from "./admin";
import { attendanceRouter } from "./attendance";
import { authRouter } from "./auth";
import { employeeRouter } from "./employee";
import { jobRouter } from "./job";
import { kasbonRouter } from "./kasbon";
import { laporanRouter } from "./laporan";
import { payrollRouter } from "./payroll";
import { storeRouter } from "./store";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => "OK"),
  auth: authRouter,
  employee: employeeRouter,
  job: jobRouter,
  kasbon: kasbonRouter,
  attendance: attendanceRouter,
  payroll: payrollRouter,
  store: storeRouter,
  laporan: laporanRouter,
  admin: adminRouter,
});
export type AppRouter = typeof appRouter;

