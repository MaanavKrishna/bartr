import "server-only";

import {
  runListingQuery,
  type ListingQuery,
  type Page,
} from "@/lib/listings/query";
import type {
  Listing,
  ListingWithSeller,
  Offer,
  OfferStatus,
  User,
} from "@/lib/types";
import { Logger } from "@/utils/logger";

import { CURRENT_USER_ID, seedListings, seedOffers, seedUsers } from "./seed";

const logger = new Logger("Data:Store");

/**
 * An in-memory store standing in for a real database.
 *
 * Every function is async and takes/returns plain domain objects, so swapping
 * this file for Prisma, Drizzle or a REST client is a contained change — no
 * call site has to move. State lives on `globalThis` so that it survives the
 * module re-evaluation that Next's dev server does on hot reload.
 */
interface Database {
  users: Map<string, User>;
  listings: Map<string, Listing>;
  offers: Map<string, Offer>;
}

const DB_KEY = Symbol.for("bartr.db");

type GlobalWithDb = typeof globalThis & { [DB_KEY]?: Database };

function createDatabase(): Database {
  logger.info("Seeding in-memory store", {
    users: seedUsers.length,
    listings: seedListings.length,
    offers: seedOffers.length,
  });
  return {
    users: new Map(seedUsers.map(user => [user.id, user])),
    listings: new Map(seedListings.map(listing => [listing.id, listing])),
    offers: new Map(seedOffers.map(offer => [offer.id, offer])),
  };
}

function db(): Database {
  const globalRef = globalThis as GlobalWithDb;
  globalRef[DB_KEY] ??= createDatabase();
  return globalRef[DB_KEY];
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function attachSeller(listing: Listing): ListingWithSeller {
  const seller = db().users.get(listing.sellerId);
  if (!seller) {
    // A listing without a seller is a data bug, not a user-facing error — fall
    // back to a placeholder so one bad row cannot blank the whole grid.
    logger.warn("Listing references unknown seller", {
      listingId: listing.id,
      sellerId: listing.sellerId,
    });
    return {
      ...listing,
      seller: {
        id: listing.sellerId,
        name: "Unknown seller",
        handle: "unknown",
        campus: listing.campus,
        bio: "",
        rating: 0,
        tradesCompleted: 0,
        joinedAt: listing.createdAt,
        verified: false,
      },
    };
  }
  return { ...listing, seller };
}

export async function getCurrentUser(): Promise<User> {
  const user = db().users.get(CURRENT_USER_ID);
  if (!user) throw new Error(`Demo user ${CURRENT_USER_ID} is missing`);
  return user;
}

export async function getUser(id: string): Promise<User | null> {
  return db().users.get(id) ?? null;
}

export async function listUsers(): Promise<User[]> {
  return [...db().users.values()];
}

export async function getAllListings(): Promise<Listing[]> {
  return [...db().listings.values()];
}

/** Runs the full browse pipeline and joins sellers onto the current page. */
export async function searchListings(
  query: ListingQuery
): Promise<Page<ListingWithSeller>> {
  const page = runListingQuery([...db().listings.values()], query);
  return { ...page, items: page.items.map(attachSeller) };
}

export async function getListing(
  id: string
): Promise<ListingWithSeller | null> {
  const listing = db().listings.get(id);
  return listing ? attachSeller(listing) : null;
}

/** Counts a page view. Fire-and-forget; never blocks rendering. */
export async function recordListingView(id: string): Promise<void> {
  const listing = db().listings.get(id);
  if (!listing) return;
  db().listings.set(id, { ...listing, views: listing.views + 1 });
}

export async function listListingsBySeller(
  sellerId: string
): Promise<ListingWithSeller[]> {
  return [...db().listings.values()]
    .filter(listing => listing.sellerId === sellerId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map(attachSeller);
}

/**
 * Listings similar to `listing`: same category first, then same campus,
 * excluding the listing itself and anything already closed.
 */
export async function listRelatedListings(
  listing: Listing,
  limit = 4
): Promise<ListingWithSeller[]> {
  const scored = [...db().listings.values()]
    .filter(other => other.id !== listing.id && other.status !== "closed")
    .map(other => ({
      other,
      score:
        (other.category === listing.category ? 4 : 0) +
        (other.campus === listing.campus ? 2 : 0) +
        (other.kind === listing.kind ? 1 : 0),
    }))
    .filter(entry => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.other.createdAt) - Date.parse(a.other.createdAt)
    );

  return scored.slice(0, limit).map(entry => attachSeller(entry.other));
}

export type NewListingInput = Omit<
  Listing,
  "id" | "createdAt" | "views" | "status" | "sellerId"
> & { sellerId?: string };

export async function createListing(
  input: NewListingInput
): Promise<ListingWithSeller> {
  const listing: Listing = {
    ...input,
    sellerId: input.sellerId ?? CURRENT_USER_ID,
    id: newId("l"),
    status: "active",
    views: 0,
    createdAt: new Date().toISOString(),
  };
  db().listings.set(listing.id, listing);
  logger.action("Listing created", { id: listing.id, title: listing.title });
  return attachSeller(listing);
}

export async function updateListingStatus(
  id: string,
  status: Listing["status"]
): Promise<Listing | null> {
  const listing = db().listings.get(id);
  if (!listing) return null;
  const updated = { ...listing, status };
  db().listings.set(id, updated);
  logger.action("Listing status changed", { id, status });
  return updated;
}

export interface OfferWithContext extends Offer {
  from: User | null;
  listing: Listing | null;
}

function withContext(offer: Offer): OfferWithContext {
  return {
    ...offer,
    from: db().users.get(offer.fromUserId) ?? null,
    listing: db().listings.get(offer.listingId) ?? null,
  };
}

export async function listOffersForListing(
  listingId: string
): Promise<OfferWithContext[]> {
  return [...db().offers.values()]
    .filter(offer => offer.listingId === listingId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map(withContext);
}

/** Offers received on any listing owned by `sellerId`. */
export async function listOffersForSeller(
  sellerId: string
): Promise<OfferWithContext[]> {
  const ownListingIds = new Set(
    [...db().listings.values()]
      .filter(listing => listing.sellerId === sellerId)
      .map(listing => listing.id)
  );

  return [...db().offers.values()]
    .filter(offer => ownListingIds.has(offer.listingId))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map(withContext);
}

export type NewOfferInput = Omit<
  Offer,
  "id" | "createdAt" | "status" | "fromUserId"
> & { fromUserId?: string };

export async function createOffer(input: NewOfferInput): Promise<Offer> {
  const offer: Offer = {
    ...input,
    fromUserId: input.fromUserId ?? CURRENT_USER_ID,
    id: newId("o"),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db().offers.set(offer.id, offer);
  logger.action("Offer created", {
    id: offer.id,
    listingId: offer.listingId,
    kind: offer.kind,
  });
  return offer;
}

export async function setOfferStatus(
  id: string,
  status: OfferStatus
): Promise<Offer | null> {
  const offer = db().offers.get(id);
  if (!offer) return null;
  const updated = { ...offer, status };
  db().offers.set(id, updated);
  return updated;
}

export interface SellerStats {
  activeListings: number;
  totalViews: number;
  pendingOffers: number;
  /** Total asking price across active `sale` listings, in cents. */
  listedValueCents: number;
}

export async function getSellerStats(sellerId: string): Promise<SellerStats> {
  const listings = [...db().listings.values()].filter(
    listing => listing.sellerId === sellerId
  );
  const offers = await listOffersForSeller(sellerId);

  return {
    activeListings: listings.filter(listing => listing.status === "active")
      .length,
    totalViews: listings.reduce((sum, listing) => sum + listing.views, 0),
    pendingOffers: offers.filter(offer => offer.status === "pending").length,
    listedValueCents: listings
      .filter(listing => listing.status === "active")
      .reduce((sum, listing) => sum + (listing.priceCents ?? 0), 0),
  };
}

export { CURRENT_USER_ID };
