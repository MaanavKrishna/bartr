/**
 * One matcher, two features.
 *
 * A **wanted listing** ("I need a desk chair, up to $60, within 5 km") and a
 * **saved search alert** ("tell me when a road bike appears") are the same
 * thing seen from different sides: a set of criteria waiting for a listing to
 * satisfy it. Building them separately would mean maintaining two subtly
 * different notions of "matches", and they would drift.
 *
 * So both compile to `MatchCriteria`, and both run through `matchListing`.
 * Wanted listings publish their criteria so sellers can browse demand; saved
 * searches keep theirs private and notify. That is the only difference.
 *
 * Pure and synchronous: the database narrows candidates cheaply with its
 * indexes, and this decides and *explains* the final match. Explanation is not
 * decoration — an alert that says why it fired is one a person keeps switched
 * on.
 */

import { haversineMetres, isUnlimitedRadius, type Point } from "@/lib/geo";
import { searchScore } from "@/lib/listings/query";
import type { Category, Condition, Listing, ListingKind } from "@/lib/types";

export interface MatchCriteria {
  /** Free text, matched with the same scorer the search box uses. */
  text: string;
  categories: Category[];
  conditions: Condition[];
  kinds: ListingKind[];
  /** Ceiling in cents. Null means no budget limit. */
  maxCents: number | null;
  minCents: number | null;
  /** Where the searcher is. Null disables distance filtering entirely. */
  origin: Point | null;
  radiusM: number;
  /** Restrict to one community, or null for any. */
  communityId: string | null;
}

export const EMPTY_CRITERIA: MatchCriteria = {
  text: "",
  categories: [],
  conditions: [],
  kinds: [],
  maxCents: null,
  minCents: null,
  origin: null,
  radiusM: 0,
  communityId: null,
};

/** A listing as the matcher needs it: the domain type plus where it is. */
export interface MatchableListing extends Listing {
  communityId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface MatchResult {
  matched: boolean;
  /** 0-1. Only meaningful when `matched`. */
  strength: number;
  /** Human-readable reasons, for the alert email and the UI. */
  reasons: string[];
  distanceM: number | null;
}

const NO_MATCH: MatchResult = {
  matched: false,
  strength: 0,
  reasons: [],
  distanceM: null,
};

function listingPoint(listing: MatchableListing): Point | null {
  if (
    typeof listing.latitude === "number" &&
    typeof listing.longitude === "number"
  ) {
    return { lat: listing.latitude, lng: listing.longitude };
  }
  return null;
}

/** The effective price for budget comparisons. Free is 0; barter has none. */
function priceForBudget(listing: Listing): number | null {
  if (listing.kind === "free") return 0;
  if (listing.kind === "barter") return null;
  return listing.priceCents;
}

export function matchListing(
  criteria: MatchCriteria,
  listing: MatchableListing
): MatchResult {
  // Never alert someone about a listing they cannot act on.
  if (listing.status !== "active") return NO_MATCH;

  if (criteria.communityId && listing.communityId !== criteria.communityId) {
    return NO_MATCH;
  }

  const reasons: string[] = [];

  if (criteria.categories.length) {
    if (!criteria.categories.includes(listing.category)) return NO_MATCH;
    reasons.push(`in ${listing.category}`);
  }

  if (criteria.conditions.length) {
    if (!criteria.conditions.includes(listing.condition)) return NO_MATCH;
  }

  if (criteria.kinds.length) {
    if (!criteria.kinds.includes(listing.kind)) return NO_MATCH;
  }

  // Budget. A barter listing has no price, so it survives a budget filter only
  // when the searcher did not set one — otherwise "under $60" would silently
  // include items with no price at all.
  const price = priceForBudget(listing);
  if (criteria.maxCents !== null) {
    if (price === null) return NO_MATCH;
    if (price > criteria.maxCents) return NO_MATCH;
    reasons.push(price === 0 ? "free" : "within budget");
  }
  if (criteria.minCents !== null) {
    if (price === null || price < criteria.minCents) return NO_MATCH;
  }

  // Distance.
  let distanceM: number | null = null;
  const point = listingPoint(listing);
  if (criteria.origin && point) {
    distanceM = haversineMetres(criteria.origin, point);
    if (!isUnlimitedRadius(criteria.radiusM) && distanceM > criteria.radiusM) {
      return NO_MATCH;
    }
    reasons.push("nearby");
  } else if (
    criteria.origin &&
    !point &&
    !isUnlimitedRadius(criteria.radiusM)
  ) {
    // A distance-limited search cannot include a listing with no location.
    return NO_MATCH;
  }

  // Text is the strongest signal, so it drives the score.
  let textScore = 1;
  if (criteria.text.trim()) {
    textScore = searchScore(listing, criteria.text);
    if (textScore === 0) return NO_MATCH;
    reasons.unshift(`matches "${criteria.text.trim()}"`);
  }

  return {
    matched: true,
    strength: strengthOf(textScore, distanceM, criteria),
    reasons,
    distanceM,
  };
}

/**
 * Combines relevance and proximity into 0-1. Text dominates; distance breaks
 * ties, because between two equally relevant items people want the near one.
 */
function strengthOf(
  textScore: number,
  distanceM: number | null,
  criteria: MatchCriteria
): number {
  // searchScore tops out around 12 per word; normalise generously.
  const relevance = Math.min(1, textScore / 12);

  if (distanceM === null || criteria.origin === null) {
    return round2(relevance);
  }

  const span = isUnlimitedRadius(criteria.radiusM)
    ? 50_000
    : Math.max(criteria.radiusM, 1);
  const proximity = Math.max(0, 1 - distanceM / span);

  return round2(relevance * 0.75 + proximity * 0.25);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Every criteria set that a new listing satisfies — the alert fan-out. */
export function matchAll<T extends { criteria: MatchCriteria }>(
  watchers: T[],
  listing: MatchableListing
): Array<{ watcher: T; result: MatchResult }> {
  return watchers
    .map(watcher => ({
      watcher,
      result: matchListing(watcher.criteria, listing),
    }))
    .filter(entry => entry.result.matched)
    .sort((a, b) => b.result.strength - a.result.strength);
}

/**
 * The reverse direction: listings that satisfy one wanted post, best first.
 * This is what turns "I need a chair" into a browsable result set.
 */
export function listingsMatching(
  criteria: MatchCriteria,
  listings: MatchableListing[],
  limit = 20
): Array<{ listing: MatchableListing; result: MatchResult }> {
  return listings
    .map(listing => ({ listing, result: matchListing(criteria, listing) }))
    .filter(entry => entry.result.matched)
    .sort((a, b) => b.result.strength - a.result.strength)
    .slice(0, limit);
}

/** Builds criteria from a wanted post. */
export function criteriaFromWanted(wanted: {
  title: string;
  category: Category | null;
  budgetCents: number | null;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  communityId: string | null;
}): MatchCriteria {
  return {
    ...EMPTY_CRITERIA,
    text: wanted.title,
    categories: wanted.category ? [wanted.category] : [],
    maxCents: wanted.budgetCents,
    origin:
      wanted.latitude !== null && wanted.longitude !== null
        ? { lat: wanted.latitude, lng: wanted.longitude }
        : null,
    radiusM: wanted.radiusM,
    communityId: wanted.communityId,
  };
}

export const ALERT_CADENCES = ["instant", "daily", "weekly", "off"] as const;
export type AlertCadence = (typeof ALERT_CADENCES)[number];

const CADENCE_INTERVAL_MS: Record<Exclude<AlertCadence, "off">, number> = {
  instant: 0,
  daily: 24 * 3_600_000,
  weekly: 7 * 24 * 3_600_000,
};

/** Whether an alert is due, so the worker can skip the rest cheaply. */
export function isAlertDue(
  cadence: AlertCadence,
  lastRunAt: string | null,
  now: Date = new Date()
): boolean {
  if (cadence === "off") return false;
  if (!lastRunAt) return true;

  const last = Date.parse(lastRunAt);
  if (Number.isNaN(last)) return true;

  return now.getTime() - last >= CADENCE_INTERVAL_MS[cadence];
}
