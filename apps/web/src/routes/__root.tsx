import type { AppRouter } from "@BMJ-KARYAWAN/api/routers/index";
import { Toaster } from "@BMJ-KARYAWAN/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

import Header from "../components/header";
import { TabBar } from "../components/tab-bar";
import { authClient } from "../lib/auth-client";

import appCss from "../index.css?url";
export interface RouterAppContext {
  trpc: TRPCOptionsProxy<AppRouter>;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        title: "BMJ Karyawan",
      },
      {
        name: "theme-color",
        content: "#0079b5",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  const { data: session } = authClient.useSession();

  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:z-50 focus-visible:m-2 focus-visible:rounded-md focus-visible:bg-background focus-visible:px-3 focus-visible:py-2"
        >
          Lewat ke konten
        </a>
        <div className="min-h-svh bg-background">
          <Header />
          <main id="main" className={session ? "pb-[calc(3.5rem+env(safe-area-inset-bottom))]" : undefined}>
            <Outlet />
          </main>
          <TabBar />
        </div>
        <Toaster richColors />
        <div className="hidden md:block">
          <TanStackRouterDevtools position="bottom-left" />
        </div>
        <div className="hidden md:block">
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        </div>
        <Scripts />
      </body>
    </html>
  );
}
