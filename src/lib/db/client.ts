import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/config/env";
import { Logger } from "@/utils/logger";

import * as schema from "./schema";

const logger = new Logger("Db:Client");

/**
 * Database handle.
 *
 * Created lazily and cached on `globalThis` so Next's dev-server module
 * reloading does not open a new pool on every edit, and so importing this
 * module never connects on its own — a build with no `DATABASE_URL` should not
 * fail, it should only fail if something actually queries.
 */
const KEY = Symbol.for("bartr.db.client");

type Handle = {
  sql: postgres.Sql;
  db: PostgresJsDatabase<typeof schema>;
};

type GlobalWithHandle = typeof globalThis & { [KEY]?: Handle };

function connect(): Handle {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Supabase database."
    );
  }

  logger.info("Opening database pool");

  const sql = postgres(env.DATABASE_URL, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: env.NODE_ENV === "production" ? 10 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return { sql, db: drizzle(sql, { schema }) };
}

function handle(): Handle {
  const globalRef = globalThis as GlobalWithHandle;
  globalRef[KEY] ??= connect();
  return globalRef[KEY];
}

/** The Drizzle query builder. */
export function db(): PostgresJsDatabase<typeof schema> {
  return handle().db;
}

/** The raw driver, for the geospatial and full-text SQL Drizzle cannot express. */
export function rawSql(): postgres.Sql {
  return handle().sql;
}

/** True when the app has been given a database to talk to. */
export function isDatabaseConfigured(): boolean {
  return Boolean(env.DATABASE_URL);
}

export { schema };
