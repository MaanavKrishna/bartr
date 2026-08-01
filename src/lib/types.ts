/**
 * Core domain model for Bartr — a campus barter & resale marketplace.
 *
 * Money is always stored as an integer number of cents so that arithmetic and
 * range filtering never hit floating point rounding problems.
 */

export const LISTING_KINDS = ["sale", "barter", "free"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export const CONDITIONS = [
  "new",
  "like-new",
  "good",
  "fair",
  "for-parts",
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CATEGORIES = [
  "textbooks",
  "electronics",
  "furniture",
  "clothing",
  "bikes",
  "dorm",
  "tickets",
  "services",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const LISTING_STATUSES = ["active", "pending", "closed"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export interface User {
  id: string;
  name: string;
  handle: string;
  campus: string;
  bio: string;
  /** Average of ratings left by trade counterparties, 0–5. */
  rating: number;
  tradesCompleted: number;
  joinedAt: string;
  verified: boolean;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  kind: ListingKind;
  /** Asking price in cents. Always null for `barter` and `free` listings. */
  priceCents: number | null;
  /** What the seller would accept in trade. Only meaningful for `barter`. */
  wants: string[];
  category: Category;
  condition: Condition;
  campus: string;
  /** Where on campus the handoff happens, e.g. "Baker Library steps". */
  meetupSpot: string;
  tags: string[];
  sellerId: string;
  status: ListingStatus;
  views: number;
  createdAt: string;
}

/** A listing joined with its seller — what the UI actually renders. */
export interface ListingWithSeller extends Listing {
  seller: User;
}

export const OFFER_KINDS = ["cash", "trade"] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export const OFFER_STATUSES = ["pending", "accepted", "declined"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export interface Offer {
  id: string;
  listingId: string;
  fromUserId: string;
  kind: OfferKind;
  /** Cash offers only. */
  amountCents: number | null;
  /** Trade offers only — the item being put up in exchange. */
  offeredItem: string | null;
  message: string;
  status: OfferStatus;
  createdAt: string;
}
