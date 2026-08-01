import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit is used to *diff* the schema, not to apply migrations — the
 * initial migration is hand-written because PostGIS generated columns and
 * tsvector indexes are outside what the generator can express. Use
 * `npm run db:generate` to see what has drifted, then fold it into a numbered
 * file in `drizzle/`.
 */
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
} satisfies Config;
