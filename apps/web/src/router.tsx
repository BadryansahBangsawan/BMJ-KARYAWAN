import type { AppRouter } from "@BMJ-KARYAWAN/api/routers/index";
import { keepPreviousData, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

import { routeTree } from "./routeTree.gen";
import { authClient } from "./lib/auth-client";
import { TRPCProvider } from "./utils/trpc";

function createQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.state.data !== undefined) return;
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
    mutationCache: new MutationCache({
      onSuccess: () => {
        void queryClient.invalidateQueries();
        void authClient.getSession({ query: { disableCookieCache: true } });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 30 * 60_000,
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true,
      },
    },
  });
  return queryClient;
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
    defaultPendingMs: Number.POSITIVE_INFINITY,
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
