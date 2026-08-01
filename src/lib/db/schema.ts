import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  CATEGORIES,
  CONDITIONS,
  LISTING_KINDS,
  LISTING_STATUSES,
  OFFER_KINDS,
  OFFER_STATUSES,
} from "@/lib/types";

/**
 * Database schema.
 *
 * The central idea is the **community**: every listing belongs to exactly one,
 * and a community is either a university (posting gated behind a verified
 * matching email domain) or a public marketplace open to anyone with a
 * confirmed email. That one column is what lets the same codebase serve both
 * "campus Bartr" and "universal Bartr" without forking — the audience and the
 * posting rule are data, not branches.
 *
 * Location is stored twice on purpose: `latitude`/`longitude` as plain numbers
 * for display and for round-tripping through forms, and `geog` as a PostGIS
 * geography point for the radius search. `geog` is generated from the two
 * columns, so they can never drift apart.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const COMMUNITY_KINDS = ["university", "public"] as const;
export type CommunityKind = (typeof COMMUNITY_KINDS)[number];

export const communities = pgTable(
  "communities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: COMMUNITY_KINDS }).notNull(),
    /**
     * Required for `university` communities, null for `public` ones. A user
     * may post here only once they hold a verified email at this domain.
     */
    emailDomain: text("email_domain"),
    /** Where the community sits, for default map centring and distance sorts. */
    centerLat: doublePrecision("center_lat"),
    centerLng: doublePrecision("center_lng"),
    /** Default browse radius in metres. */
    defaultRadiusM: integer("default_radius_m").notNull().default(8000),
    description: text("description"),
    ...timestamps,
  },
  table => [
    uniqueIndex("communities_slug_key").on(table.slug),
    uniqueIndex("communities_email_domain_key").on(table.emailDomain),
  ]
);

export const users = pgTable(
  "users",
  {
    /** Mirrors `auth.users.id` from Supabase Auth. */
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio").notNull().default(""),
    avatarUrl: text("avatar_url"),
    /** Where this user searches from by default. */
    homeLat: doublePrecision("home_lat"),
    homeLng: doublePrecision("home_lng"),
    homeLabel: text("home_label"),
    preferredRadiusM: integer("preferred_radius_m").notNull().default(16000),
    /**
     * Denormalised from `ratings` so listing cards can show a seller score
     * without a correlated subquery on every row.
     */
    ratingAvg: doublePrecision("rating_avg"),
    ratingCount: integer("rating_count").notNull().default(0),
    tradesCompleted: integer("trades_completed").notNull().default(0),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    ...timestamps,
  },
  table => [
    uniqueIndex("users_handle_key").on(table.handle),
    uniqueIndex("users_email_key").on(table.email),
  ]
);

export const VERIFICATION_KINDS = ["email", "student", "phone"] as const;
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];

export const VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * Proof a user has cleared some bar. `student` verifications carry the
 * community they unlock; `email` and `phone` are global.
 */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: VERIFICATION_KINDS }).notNull(),
    status: text("status", { enum: VERIFICATION_STATUSES })
      .notNull()
      .default("pending"),
    communityId: uuid("community_id").references(() => communities.id, {
      onDelete: "cascade",
    }),
    /** The address or number that was proven, kept for audit and display. */
    evidence: text("evidence"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  table => [
    index("verifications_user_idx").on(table.userId),
    // One verification row per user per kind per community. The real index is
    // declared NULLS NOT DISTINCT in drizzle/0000_init.sql so that a user
    // cannot hold two `email` rows (both with a null community); Drizzle's
    // builder cannot express that modifier, so this definition is the
    // type-level shadow of it rather than the source of truth.
    uniqueIndex("verifications_unique").on(
      table.userId,
      table.kind,
      table.communityId
    ),
  ]
);

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "restrict" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    kind: text("kind", { enum: LISTING_KINDS }).notNull(),
    priceCents: integer("price_cents"),
    wants: text("wants")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    category: text("category", { enum: CATEGORIES }).notNull(),
    condition: text("condition", { enum: CONDITIONS }).notNull(),
    status: text("status", { enum: LISTING_STATUSES })
      .notNull()
      .default("active"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    /** Human-readable handoff spot, e.g. "Baker Library steps". */
    locationLabel: text("location_label").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    views: integer("views").notNull().default(0),
    ...timestamps,
  },
  table => [
    index("listings_community_idx").on(table.communityId),
    index("listings_seller_idx").on(table.sellerId),
    index("listings_category_idx").on(table.category),
    index("listings_created_idx").on(table.createdAt),
    index("listings_status_idx").on(table.status),
  ]
);

export const listingImages = pgTable(
  "listing_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** Object key in Supabase Storage, not a signed URL. */
    storagePath: text("storage_path").notNull(),
    width: integer("width"),
    height: integer("height"),
    blurhash: text("blurhash"),
    position: smallint("position").notNull().default(0),
    createdAt: timestamps.createdAt,
  },
  table => [
    index("listing_images_listing_idx").on(table.listingId, table.position),
  ]
);

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: OFFER_KINDS }).notNull(),
    amountCents: integer("amount_cents"),
    offeredItem: text("offered_item"),
    message: text("message").notNull(),
    status: text("status", { enum: OFFER_STATUSES })
      .notNull()
      .default("pending"),
    ...timestamps,
  },
  table => [
    index("offers_listing_idx").on(table.listingId),
    index("offers_from_user_idx").on(table.fromUserId),
  ]
);

/** One conversation per (listing, buyer) pair. */
export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    ...timestamps,
  },
  table => [
    uniqueIndex("threads_listing_buyer_key").on(table.listingId, table.buyerId),
    index("threads_seller_idx").on(table.sellerId),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  table => [index("messages_thread_idx").on(table.threadId, table.createdAt)]
);

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    raterId: uuid("rater_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rateeId: uuid("ratee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: smallint("score").notNull(),
    comment: text("comment"),
    createdAt: timestamps.createdAt,
  },
  table => [
    // One rating per person per trade, in each direction.
    uniqueIndex("ratings_unique").on(table.listingId, table.raterId),
    index("ratings_ratee_idx").on(table.rateeId),
  ]
);

export const savedListings = pgTable(
  "saved_listings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    createdAt: timestamps.createdAt,
  },
  table => [
    primaryKey({ columns: [table.userId, table.listingId] }),
    index("saved_listings_user_idx").on(table.userId, table.createdAt),
  ]
);

export const NOTIFICATION_KINDS = [
  "offer_received",
  "offer_accepted",
  "offer_declined",
  "message_received",
  "rating_received",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Set once the email for this notification has actually been sent. */
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    emailSuppressed: boolean("email_suppressed").notNull().default(false),
    createdAt: timestamps.createdAt,
  },
  table => [index("notifications_user_idx").on(table.userId, table.createdAt)]
);

export type CommunityRow = typeof communities.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type ListingRow = typeof listings.$inferSelect;
export type OfferRow = typeof offers.$inferSelect;
export type ThreadRow = typeof threads.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type RatingRow = typeof ratings.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type ListingImageRow = typeof listingImages.$inferSelect;
