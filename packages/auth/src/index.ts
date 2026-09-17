import type { Database } from "@BMJ-KARYAWAN/db";
import * as schema from "@BMJ-KARYAWAN/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
};

export function createAuth(env: AuthConfig, database: Database) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema,
    }),
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    ...(env.GOOGLE_CLIENT_ID
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              disableImplicitSignUp: true,
            },
          },
        }
      : {}),
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
        requireLocalEmailVerified: false,
      },
    },
    onAPIError: {
      errorURL: `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/login`,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "mekanik",
          input: false,
        },
      },
    },
    plugins: [tanstackStartCookies()],
  });
}
