import type { AppRouter } from "@BMJ-KARYAWAN/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCContext } from "@trpc/tanstack-react-query";

export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

