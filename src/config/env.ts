import { z } from "zod";

import { Logger } from "@/utils/logger";

const logger = new Logger("Config:Env");

/**
 * Environment configuration.
 *
 * `NEXT_PUBLIC_*` values are read through explicit `process.env.X` references
 * because Next inlines them at build time — a dynamic lookup would come back
 * undefined in the browser bundle.
 *
 * Optional variables carry defaults instead of throwing. Only genuinely
 * required configuration should ever be allowed to fail the boot, and this app
 * has none yet, so a missing `.env` is not an error.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a full URL, e.g. http://localhost:3000")
    .default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Bartr"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  });

  if (result.success) return result.data;

  const problems = result.error.errors.map(
    issue => `${issue.path.join(".")}: ${issue.message}`
  );
  logger.error("Invalid environment variables", { problems });

  // A bad value that is set is a real misconfiguration and should stop the
  // process; a missing optional value never reaches this branch.
  throw new Error(`Invalid environment variables — ${problems.join("; ")}`);
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
