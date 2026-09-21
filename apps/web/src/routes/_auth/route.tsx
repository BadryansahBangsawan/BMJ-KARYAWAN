import { useQueryClient } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { getUser } from "@/functions/get-user";
import { jayapuraYearMonth, monthBounds } from "@/lib/format";
import { sessionRole } from "@/lib/session-role";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth")({
  staleTime: 5 * 60 * 1000,
  component: AuthLayout,
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({
        to: "/login",
      });
    }
    return { session };
  },
});

function AuthLayout() {
  const { session } = Route.useRouteContext();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const role = sessionRole(session?.user);

  useEffect(() => {
    const { year, month } = jayapuraYearMonth();
    void queryClient.prefetchQuery(trpc.kasbon.list.queryOptions({}));
    void queryClient.prefetchQuery(
      trpc.job.list.queryOptions(monthBounds()),
    );
    void queryClient.prefetchQuery(trpc.payroll.get.queryOptions({ year, month }));
    void queryClient.prefetchQuery(trpc.employee.me.queryOptions());
    void queryClient.prefetchQuery(trpc.attendance.mineToday.queryOptions());
    if (role === "kasir" || role === "supervisor") {
      void queryClient.prefetchQuery(trpc.kasbon.summary.queryOptions());
    }
    if (role === "kasir") {
      void queryClient.prefetchQuery(trpc.store.list.queryOptions());
      void queryClient.prefetchQuery(trpc.store.summary.queryOptions());
    }
    if (role === "supervisor") {
      void queryClient.prefetchQuery(trpc.employee.list.queryOptions());
      void queryClient.prefetchQuery(trpc.attendance.month.queryOptions({ year, month }));
    }
  }, [queryClient, role, trpc]);

  return <Outlet />;
}
