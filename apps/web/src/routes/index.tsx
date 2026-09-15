import { createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getUser();
    throw redirect({
      to: session ? "/dashboard" : "/login",
    });
  },
  component: () => null,
});
