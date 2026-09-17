import type { AppRouter } from "@BMJ-KARYAWAN/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

import { routeTree } from "./routeTree.gen";
import { TRPCProvider } from "./utils/trpc";

function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(error.message, {
          action: {
            label: "Coba lagi",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 3_000,
        refetchInterval: 8_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });
}

const trpcFetch = createIsomorphicFn()
  .client((url: string | URL | Request, options?: RequestInit) =>
    fetch(url, { ...options, credentials: "include" }),
  )
  .server(async (url: string | URL | Request, options?: RequestInit) => {
    const href =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.href
          : url.url;
    const { getRequest } = await import("@tanstack/react-start/server");
    const incoming = getRequest();
    const path = href.startsWith("http")
      ? `${new URL(href).pathname}${new URL(href).search}`
      : href;
    const request = new Request(new URL(path, incoming.url), {
      method: options?.method ?? "GET",
      headers: options?.headers ?? incoming.headers,
      body: options?.body,
    });
    const { fetchRequestHandler } = await import("@trpc/server/adapters/fetch");
    const { appRouter } = await import("@BMJ-KARYAWAN/api/routers/index");
    const { createContext } = await import("./context");
    return fetchRequestHandler({
      req: request,
      router: appRouter,
      createContext,
      endpoint: "/api/trpc",
    });
  });

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      fetch: trpcFetch,
    }),
  ],
});

export const getRouter = () => {
  const queryClient = createQueryClient();
  const trpc = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient,
  });

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    defaultPendingMs: 400,
    context: { trpc, queryClient },
    defaultNotFoundComponent: () => <div>Halaman tidak ditemukan</div>,
    Wrap: ({ children }) => (
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
