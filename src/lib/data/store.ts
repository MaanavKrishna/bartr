import "server-only";

import { isDatabaseConfigured, rawSql } from "@/lib/db/client";
import { paginate, type ListingQuery, type Page } from "@/lib/listings/query";
import type {
  Listing,
  ListingWithSeller,
  Offer,
  OfferStatus,
  User,
} from "@/lib/types";
import { Logger } from "@/utils/logger";

const logger = new Logger("Data:Store");

/**
 * Data access, backed by Postgres.
 *
 * The exported surface is unchanged from the in-memory version this replaced —
 * that was the point of putting every call behind an async, plain-object API.
 * Pages and route handlers did not move.
 *
 * Two behaviours worth knowing:
 *
 * - **Search runs in the database.** Filtering, full-text ranking, distance and
 *   ordering are one indexed SQL query, not a table scan in Node. Only
 *   pagination is applied in application code, over the already-narrowed set.
 * - **No database is not a crash.** If `DATABASE_URL` is absent the reads
 *   return empty and the writes throw. A deployment missing configuration
 *   should render an empty marketplace and say so, not 500 on every route.
 */

/**
 * Column coercion.
 *
 * Queries that embed a `sql.unsafe()` fragment run over the simple query
 * protocol, where Postgres returns *every* value as text — dates are not
 * Dates and integers are not numbers. Rather than depend on which protocol a
 * given query happens to use, every value is coerced explicitly here. This
 * also means a schema type change cannot silently produce string arithmetic.
 */
function asIso(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date(0).toISOString();
}

function asNumber(
  value: number | string | null | undefined,
  fallback = 0
): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNullableNumber(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Shape returned by the listing SELECTs below. */
interface ListingRow {
  id: string;
  title: string;
  description: string;
  kind: Listing["kind"];
  price_cents: number | string | null;
  wants: string[];
  category: Listing["category"];
  condition: Listing["condition"];
  status: Listing["status"];
  location_label: string;
  latitude: number | string;
  longitude: number | string;
  tags: string[];
  views: number | string;
  created_at: Date | string;
  seller_id: string;
  community_name: string;
  seller_email?: string;
  seller_handle?: string;
  seller_display_name?: string;
  seller_bio?: string;
  seller_rating?: number | string | null;
  seller_trades?: number | string;
  seller_joined?: Date | string;
  seller_verified_at?: Date | string | null;
}

/**
 * Maps a row onto the domain type. `campus` and `meetupSpot` are the
 * community's name and the listing's location label — the domain type predates
 * communities and still speaks the older vocabulary.
 */
function toListing(row: ListingRow): Listing {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    priceCents: asNullableNumber(row.price_cents),
    wants: row.wants ?? [],
    category: row.category,
    condition: row.condition,
    campus: row.community_name,
    meetupSpot: row.location_label,
    tags: row.tags ?? [],
    sellerId: row.seller_id,
    status: row.status,
    views: asNumber(row.views),
    createdAt: asIso(row.created_at),
  };
}

function toSeller(row: ListingRow): User {
  return {
    id: row.seller_id,
    name: row.seller_display_name ?? "Unknown seller",
    handle: row.seller_handle ?? "unknown",
    campus: row.community_name,
    bio: row.seller_bio ?? "",
    rating: asNumber(row.seller_rating),
    tradesCompleted: asNumber(row.seller_trades),
    joinedAt: asIso(row.seller_joined ?? row.created_at),
    verified: Boolean(row.seller_verified_at),
  };
}

function toListingWithSeller(row: ListingRow): ListingWithSeller {
  return { ...toListing(row), seller: toSeller(row) };
}

/** Columns every listing query selects, so the row mapper always fits. */
const LISTING_COLUMNS = `
  l.id, l.title, l.description, l.kind, l.price_cents, l.wants, l.category,
  l.condition, l.status, l.location_label, l.latitude, l.longitude, l.tags,
  l.views, l.created_at, l.seller_id,
  c.name AS community_name,
  u.handle AS seller_handle, u.display_name AS seller_display_name,
  u.bio AS seller_bio, u.rating_avg AS seller_rating,
  u.trades_completed AS seller_trades, u.created_at AS seller_joined,
  u.email_verified_at AS seller_verified_at
`;

const LISTING_JOINS = `
  FROM listings l
  JOIN communities c ON c.id = l.community_id
  JOIN users u       ON u.id = l.seller_id
`;

function unconfigured(what: string): void {
  logger.warn(`${what} skipped — DATABASE_URL is not set`);
}

const EMPTY_PAGE: Page<ListingWithSeller> = {
  items: [],
  total: 0,
  page: 1,
  perPage: 12,
  totalPages: 1,
};

export async function getCurrentUser(): Promise<User | null> {
  // No authentication yet, so nobody is signed in. Returning null rather than
  // a stand-in keeps every caller honest about the signed-out case.
  return null;
}

export async function getUser(id: string): Promise<User | null> {
  if (!isDatabaseConfigured()) return (unconfigured("getUser"), null);

  const rows = await rawSql()<
    Array<{
      id: string;
      display_name: string;
      handle: string;
      bio: string;
      rating_avg: number | string | null;
      trades_completed: number | string;
      created_at: Date | string;
      email_verified_at: Date | string | null;
    }>
  >`SELECT id, display_name, handle, bio, rating_avg, trades_completed,
           created_at, email_verified_at
      FROM users WHERE id = ${id} LIMIT 1`;

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.display_name,
    handle: row.handle,
    campus: "",
    bio: row.bio,
    rating: asNumber(row.rating_avg),
    tradesCompleted: asNumber(row.trades_completed),
    joinedAt: asIso(row.created_at),
    verified: Boolean(row.email_verified_at),
  };
}

export async function listUsers(): Promise<User[]> {
  return [];
}

export async function getAllListings(): Promise<Listing[]> {
  if (!isDatabaseConfigured()) return (unconfigured("getAllListings"), []);

  const rows = await rawSql()<ListingRow[]>`
    SELECT ${rawSql().unsafe(LISTING_COLUMNS)} ${rawSql().unsafe(LISTING_JOINS)}
    WHERE l.status <> 'closed'
    ORDER BY l.created_at DESC
    LIMIT 1000
  `;
  return rows.map(toListing);
}

/**
 * The browse pipeline, as one query.
 *
 * Filters, full-text rank and ordering are all pushed into Postgres so the
 * GIN and btree indexes do the work. `websearch_to_tsquery` is used rather
 * than `plainto_tsquery` because it understands quoted phrases and `-`
 * exclusions the way people already expect a search box to behave.
 */
export async function searchListings(
  query: ListingQuery
): Promise<Page<ListingWithSeller>> {
  if (!isDatabaseConfigured())
    return (unconfigured("searchListings"), EMPTY_PAGE);

  const sql = rawSql();
  const term = query.q.trim();

  const rows = await sql<ListingRow[]>`
    SELECT ${sql.unsafe(LISTING_COLUMNS)}
    ${sql.unsafe(LISTING_JOINS)}
    WHERE l.status <> 'closed'
      ${term ? sql`AND l.search_vector @@ websearch_to_tsquery('english', ${term})` : sql``}
      ${query.categories.length ? sql`AND l.category = ANY(${query.categories})` : sql``}
      ${query.conditions.length ? sql`AND l.condition = ANY(${query.conditions})` : sql``}
      ${query.kinds.length ? sql`AND l.kind = ANY(${query.kinds})` : sql``}
      ${query.campus ? sql`AND c.name = ${query.campus}` : sql``}
      ${
        query.minCents !== null
          ? sql`AND COALESCE(l.price_cents, CASE WHEN l.kind = 'free' THEN 0 END) >= ${query.minCents}`
          : sql``
      }
      ${
        query.maxCents !== null
          ? sql`AND COALESCE(l.price_cents, CASE WHEN l.kind = 'free' THEN 0 END) <= ${query.maxCents}`
          : sql``
      }
    ORDER BY
      ${
        term
          ? sql`ts_rank(l.search_vector, websearch_to_tsquery('english', ${term})) DESC,`
          : sql``
      }
      ${sql.unsafe(orderClause(query.sort))}
    LIMIT 500
  `;

  // Pagination over the narrowed set. Cheap, and it keeps `totalPages`
  // consistent with the in-memory implementation's semantics.
  const page = paginate(rows, query.page, query.perPage);
  return { ...page, items: page.items.map(toListingWithSeller) };
}

function orderClause(sort: ListingQuery["sort"]): string {
  switch (sort) {
    case "price-asc":
      // Barter listings have no price; keep them last in either direction.
      return "l.price_cents ASC NULLS LAST";
    case "price-desc":
      return "l.price_cents DESC NULLS LAST";
    case "popular":
      return "l.views DESC";
    case "newest":
    default:
      return "l.created_at DESC";
  }
}

export async function getListing(
  id: string
): Promise<ListingWithSeller | null> {
  if (!isDatabaseConfigured()) return (unconfigured("getListing"), null);

  const sql = rawSql();
  // A malformed id must 404, not explode on a uuid cast.
  if (!isUuid(id)) return null;

  const rows = await sql<ListingRow[]>`
    SELECT ${sql.unsafe(LISTING_COLUMNS)} ${sql.unsafe(LISTING_JOINS)}
    WHERE l.id = ${id} LIMIT 1
  `;
  return rows[0] ? toListingWithSeller(rows[0]) : null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function recordListingView(id: string): Promise<void> {
  if (!isDatabaseConfigured() || !isUuid(id)) return;
  await rawSql()`UPDATE listings SET views = views + 1 WHERE id = ${id}`;
}

export async function listListingsBySeller(
  sellerId: string
): Promise<ListingWithSeller[]> {
  if (!isDatabaseConfigured() || !isUuid(sellerId)) return [];

  const sql = rawSql();
  const rows = await sql<ListingRow[]>`
    SELECT ${sql.unsafe(LISTING_COLUMNS)} ${sql.unsafe(LISTING_JOINS)}
    WHERE l.seller_id = ${sellerId}
    ORDER BY l.created_at DESC
  `;
  return rows.map(toListingWithSeller);
}

/** Same category first, then same community, newest breaking ties. */
export async function listRelatedListings(
  listing: Listing,
  limit = 4
): Promise<ListingWithSeller[]> {
  if (!isDatabaseConfigured() || !isUuid(listing.id)) return [];

  const sql = rawSql();
  const rows = await sql<ListingRow[]>`
    SELECT ${sql.unsafe(LISTING_COLUMNS)} ${sql.unsafe(LISTING_JOINS)}
    WHERE l.id <> ${listing.id}
      AND l.status = 'active'
      AND (l.category = ${listing.category} OR c.name = ${listing.campus})
    ORDER BY
      (l.category = ${listing.category})::int DESC,
      (c.name = ${listing.campus})::int DESC,
      l.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toListingWithSeller);
}

export type NewListingInput = Omit<
  Listing,
  "id" | "createdAt" | "views" | "status" | "sellerId"
> & {
  sellerId?: string;
  communityId?: string;
  latitude?: number;
  longitude?: number;
};

export async function createListing(
  input: NewListingInput
): Promise<ListingWithSeller> {
  requireDatabase();
  const sql = rawSql();

  // Resolve the community by name when the caller still speaks `campus`.
  const community = await sql<
    Array<{
      id: string;
      center_lat: number | string | null;
      center_lng: number | string | null;
    }>
  >`
    SELECT id, center_lat, center_lng FROM communities
    WHERE ${input.communityId ? sql`id = ${input.communityId}` : sql`name = ${input.campus}`}
    LIMIT 1
  `;
  if (!community[0]) {
    throw new Error(`Unknown community: ${input.communityId ?? input.campus}`);
  }

  if (!input.sellerId) {
    throw new Error("A listing needs a signed-in seller.");
  }

  const latitude = input.latitude ?? asNullableNumber(community[0].center_lat);
  const longitude =
    input.longitude ?? asNullableNumber(community[0].center_lng);
  if (latitude === null || longitude === null) {
    throw new Error("A listing needs a location.");
  }

  const inserted = await sql<Array<{ id: string }>>`
    INSERT INTO listings (
      community_id, seller_id, title, description, kind, price_cents, wants,
      category, condition, latitude, longitude, location_label, tags
    ) VALUES (
      ${community[0].id}, ${input.sellerId}, ${input.title}, ${input.description},
      ${input.kind}, ${input.priceCents}, ${input.wants}, ${input.category},
      ${input.condition}, ${latitude}, ${longitude}, ${input.meetupSpot},
      ${input.tags}
    )
    RETURNING id
  `;

  logger.action("Listing created", { id: inserted[0].id });

  const created = await getListing(inserted[0].id);
  if (!created) throw new Error("Listing vanished immediately after insert");
  return created;
}

export async function updateListingStatus(
  id: string,
  status: Listing["status"]
): Promise<Listing | null> {
  requireDatabase();
  if (!isUuid(id)) return null;

  const sql = rawSql();
  await sql`UPDATE listings SET status = ${status}, updated_at = now() WHERE id = ${id}`;
  const listing = await getListing(id);
  return listing;
}

export interface OfferWithContext extends Offer {
  from: User | null;
  listing: Listing | null;
}

interface OfferRow {
  id: string;
  listing_id: string;
  from_user_id: string;
  kind: Offer["kind"];
  amount_cents: number | string | null;
  offered_item: string | null;
  message: string;
  status: OfferStatus;
  created_at: Date | string;
  from_display_name: string | null;
  from_handle: string | null;
  from_rating: number | string | null;
  from_trades: number | string | null;
  from_joined: Date | string | null;
  listing_title: string | null;
}

function toOffer(row: OfferRow): OfferWithContext {
  return {
    id: row.id,
    listingId: row.listing_id,
    fromUserId: row.from_user_id,
    kind: row.kind,
    amountCents: asNullableNumber(row.amount_cents),
    offeredItem: row.offered_item,
    message: row.message,
    status: row.status,
    createdAt: asIso(row.created_at),
    from: row.from_display_name
      ? {
          id: row.from_user_id,
          name: row.from_display_name,
          handle: row.from_handle ?? "unknown",
          campus: "",
          bio: "",
          rating: asNumber(row.from_rating),
          tradesCompleted: asNumber(row.from_trades),
          joinedAt: asIso(row.from_joined ?? row.created_at),
          verified: false,
        }
      : null,
    // Only the title is needed by callers; a full listing join per offer would
    // be wasteful.
    listing: row.listing_title
      ? ({ id: row.listing_id, title: row.listing_title } as Listing)
      : null,
  };
}

const OFFER_SELECT = `
  o.id, o.listing_id, o.from_user_id, o.kind, o.amount_cents, o.offered_item,
  o.message, o.status, o.created_at,
  u.display_name AS from_display_name, u.handle AS from_handle,
  u.rating_avg AS from_rating, u.trades_completed AS from_trades,
  u.created_at AS from_joined,
  l.title AS listing_title
  FROM offers o
  JOIN users u    ON u.id = o.from_user_id
  JOIN listings l ON l.id = o.listing_id
`;

export async function listOffersForListing(
  listingId: string
): Promise<OfferWithContext[]> {
  if (!isDatabaseConfigured() || !isUuid(listingId)) return [];

  const sql = rawSql();
  const rows = await sql<OfferRow[]>`
    SELECT ${sql.unsafe(OFFER_SELECT)}
    WHERE o.listing_id = ${listingId}
    ORDER BY o.created_at DESC
  `;
  return rows.map(toOffer);
}

export async function listOffersForSeller(
  sellerId: string
): Promise<OfferWithContext[]> {
  if (!isDatabaseConfigured() || !isUuid(sellerId)) return [];

  const sql = rawSql();
  const rows = await sql<OfferRow[]>`
    SELECT ${sql.unsafe(OFFER_SELECT)}
    WHERE l.seller_id = ${sellerId}
    ORDER BY o.created_at DESC
  `;
  return rows.map(toOffer);
}

export type NewOfferInput = Omit<
  Offer,
  "id" | "createdAt" | "status" | "fromUserId"
> & { fromUserId?: string };

export async function createOffer(input: NewOfferInput): Promise<Offer> {
  requireDatabase();
  if (!input.fromUserId) {
    throw new Error("An offer needs a signed-in sender.");
  }

  const sql = rawSql();
  const rows = await sql<Array<{ id: string; created_at: Date | string }>>`
    INSERT INTO offers (listing_id, from_user_id, kind, amount_cents, offered_item, message)
    VALUES (${input.listingId}, ${input.fromUserId}, ${input.kind},
            ${input.amountCents}, ${input.offeredItem}, ${input.message})
    RETURNING id, created_at
  `;

  logger.action("Offer created", {
    id: rows[0].id,
    listingId: input.listingId,
  });

  return {
    ...input,
    fromUserId: input.fromUserId,
    id: rows[0].id,
    status: "pending",
    createdAt: asIso(rows[0].created_at),
  };
}

export async function setOfferStatus(
  id: string,
  status: OfferStatus
): Promise<Offer | null> {
  requireDatabase();
  if (!isUuid(id)) return null;

  const sql = rawSql();
  const rows = await sql<OfferRow[]>`
    UPDATE offers SET status = ${status}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, listing_id, from_user_id, kind, amount_cents, offered_item,
              message, status, created_at,
              NULL::text AS from_display_name, NULL::text AS from_handle,
              NULL::double precision AS from_rating, NULL::int AS from_trades,
              NULL::timestamptz AS from_joined, NULL::text AS listing_title
  `;
  return rows[0] ? toOffer(rows[0]) : null;
}

export interface SellerStats {
  activeListings: number;
  totalViews: number;
  pendingOffers: number;
  listedValueCents: number;
}

export async function getSellerStats(sellerId: string): Promise<SellerStats> {
  const empty: SellerStats = {
    activeListings: 0,
    totalViews: 0,
    pendingOffers: 0,
    listedValueCents: 0,
  };
  if (!isDatabaseConfigured() || !isUuid(sellerId)) return empty;

  const sql = rawSql();
  const rows = await sql<
    Array<{
      active_listings: number | string;
      total_views: number | string;
      listed_value: number | string;
      pending_offers: number | string;
    }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE l.status = 'active')::int              AS active_listings,
      COALESCE(SUM(l.views), 0)::int                                AS total_views,
      COALESCE(SUM(l.price_cents) FILTER (WHERE l.status = 'active'), 0)::int
                                                                    AS listed_value,
      (SELECT COUNT(*)::int FROM offers o
         JOIN listings ol ON ol.id = o.listing_id
        WHERE ol.seller_id = ${sellerId} AND o.status = 'pending') AS pending_offers
    FROM listings l
    WHERE l.seller_id = ${sellerId}
  `;

  const row = rows[0];
  if (!row) return empty;

  return {
    activeListings: asNumber(row.active_listings),
    totalViews: asNumber(row.total_views),
    pendingOffers: asNumber(row.pending_offers),
    listedValueCents: asNumber(row.listed_value),
  };
}

function requireDatabase(): void {
  if (!isDatabaseConfigured()) {
    throw new Error(
      "DATABASE_URL is not set — this action needs a database. See .env.example."
    );
  }
}
