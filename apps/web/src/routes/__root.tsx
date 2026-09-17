import type { AppRouter } from "@BMJ-KARYAWAN/api/routers/index";
import { Toaster } from "@BMJ-KARYAWAN/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

import { AppSidebar } from "../components/app-sidebar";
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
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      {
        title: "BMJ Karyawan",
      },
      {
        name: "application-name",
        content: "BMJ Karyawan",
      },
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-title",
        content: "Karyawan",
      },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "default",
      },
      {
        name: "mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "theme-color",
        content: "#9f1d1d",
      },
      {
        property: "og:image",
        content: "/logo.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "manifest",
        href: "/manifest.webmanifest",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        href: "/logo.png",
        type: "image/png",
        sizes: "any",
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
        <div className="flex min-h-svh bg-background">
          {session ? <AppSidebar /> : null}
          <div className="flex min-h-svh min-w-0 flex-1 flex-col overflow-x-clip">
            <Header />
            <main
              id="main"
              className={
                session
                  ? "min-w-0 flex-1 overflow-x-clip pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0"
                  : "min-w-0 flex-1 overflow-x-clip"
              }
            >
              <Outlet />
            </main>
            <TabBar />
          </div>
        </div>
        <Toaster richColors closeButton duration={10000} />
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
