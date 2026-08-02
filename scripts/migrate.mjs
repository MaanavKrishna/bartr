#!/usr/bin/env node
/**
 * Applies every numbered SQL file in `drizzle/` in order, once.
 *
 * Deliberately tiny: the migrations are hand-written SQL (PostGIS generated
 * columns are beyond what a generator can express), so all this needs to do is
 * run files in sequence and remember which ones it has run.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "  Local:    postgres://postgres@localhost:5433/bartr\n" +
      "  Supabase: use the session pooler connection string (port 5432)."
  );
  process.exit(1);
}

const dir = join(process.cwd(), "drizzle");
const files = readdirSync(dir)
  .filter(name => name.endsWith(".sql"))
  .sort();

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const applied = new Set(
    (await sql`SELECT name FROM _migrations`).map(row => row.name)
  );

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    process.stdout.write(`  apply ${file} … `);
    // Each migration runs in its own transaction, so a failure leaves the
    // database on the last good migration rather than half-way through one.
    await sql.begin(async tx => {
      await tx.unsafe(readFileSync(join(dir, file), "utf8"));
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
    console.log("ok");
    ran += 1;
  }

  console.log(
    ran === 0 ? "Already up to date." : `Applied ${ran} migration(s).`
  );
} catch (error) {
  console.error("\nMigration failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
