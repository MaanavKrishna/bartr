#!/usr/bin/env node
/**
 * Seeds the *structural* rows the app needs to function: the universal
 * marketplace and a starter set of university communities.
 *
 * There is deliberately no demo content here — no invented users, listings or
 * offers. Fabricated listings on a live marketplace are indistinguishable from
 * fraud to a real visitor, and they corrupt every metric you would want to
 * read. The marketplace starts empty and fills with real posts.
 *
 * Idempotent: re-running updates existing rows rather than duplicating them.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

/** The open marketplace. Every non-student listing belongs here. */
const PUBLIC_COMMUNITY = {
  slug: "universal",
  name: "Bartr Universal",
  kind: "public",
  email_domain: null,
  center_lat: null,
  center_lng: null,
  default_radius_m: 16000,
  description:
    "The open marketplace. Buy, sell and trade with people near you, anywhere.",
};

/**
 * Starter universities. `email_domain` is the credential that unlocks posting
 * in each, so it must be the institution's real mail domain.
 */
const UNIVERSITIES = [
  ["dartmouth", "Dartmouth College", "dartmouth.edu", 43.7044, -72.2887],
  ["bu", "Boston University", "bu.edu", 42.3505, -71.1054],
  ["berkeley", "UC Berkeley", "berkeley.edu", 37.8719, -122.2585],
  ["gatech", "Georgia Tech", "gatech.edu", 33.7756, -84.3963],
  ["utaustin", "UT Austin", "utexas.edu", 30.2849, -97.7341],
  ["nyu", "New York University", "nyu.edu", 40.7295, -73.9965],
  ["umich", "University of Michigan", "umich.edu", 42.278, -83.7382],
  ["uw", "University of Washington", "uw.edu", 47.6553, -122.3035],
  ["oxford", "University of Oxford", "ox.ac.uk", 51.7548, -1.2544],
  ["cambridge", "University of Cambridge", "cam.ac.uk", 52.2043, 0.1149],
  ["imperial", "Imperial College London", "imperial.ac.uk", 51.4988, -0.1749],
  ["toronto", "University of Toronto", "utoronto.ca", 43.6629, -79.3957],
  [
    "melbourne",
    "University of Melbourne",
    "unimelb.edu.au",
    -37.7964,
    144.9612,
  ],
  ["nus", "National University of Singapore", "u.nus.edu", 1.2966, 103.7764],
  ["iitb", "IIT Bombay", "iitb.ac.in", 19.1334, 72.9133],
];

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  const rows = [
    PUBLIC_COMMUNITY,
    ...UNIVERSITIES.map(([slug, name, domain, lat, lng]) => ({
      slug,
      name,
      kind: "university",
      email_domain: domain,
      center_lat: lat,
      center_lng: lng,
      // Campuses are compact; a tighter default than the universal 16 km.
      default_radius_m: 8000,
      description: `The ${name} student marketplace.`,
    })),
  ];

  for (const row of rows) {
    await sql`
      INSERT INTO communities ${sql(row)}
      ON CONFLICT (slug) DO UPDATE SET
        name             = EXCLUDED.name,
        kind             = EXCLUDED.kind,
        email_domain     = EXCLUDED.email_domain,
        center_lat       = EXCLUDED.center_lat,
        center_lng       = EXCLUDED.center_lng,
        default_radius_m = EXCLUDED.default_radius_m,
        description      = EXCLUDED.description,
        updated_at       = now()
    `;
  }

  const [{ count }] = await sql`SELECT count(*)::int FROM communities`;
  const [{ listings }] =
    await sql`SELECT count(*)::int AS listings FROM listings`;

  console.log(`Seeded ${rows.length} communities (${count} total).`);
  console.log(
    `Listings in database: ${listings}. No demo listings are created — real posts only.`
  );
} catch (error) {
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
