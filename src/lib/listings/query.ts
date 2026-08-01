import {
  CATEGORIES,
  CONDITIONS,
  DEFAULT_PER_PAGE,
  DEFAULT_SORT,
  LISTING_KINDS,
  SORT_KEYS,
  type SortKey,
} from "@/lib/constants";
import type { Category, Condition, Listing, ListingKind } from "@/lib/types";

/**
 * The marketplace filter state. Every field is derived from the URL, which
 * makes the browse page shareable, back-button friendly and server-rendered.
 */
export interface ListingQuery {
  q: string;
  categories: Category[];
  conditions: Condition[];
  kinds: ListingKind[];
  campus: string | null;
  /** Inclusive bounds in cents. */
  minCents: number | null;
  maxCents: number | null;
  sort: SortKey;
  page: number;
  perPage: number;
}

export const EMPTY_QUERY: ListingQuery = {
  q: "",
  categories: [],
  conditions: [],
  kinds: [],
  campus: null,
  minCents: null,
  maxCents: null,
  sort: DEFAULT_SORT,
  page: 1,
  perPage: DEFAULT_PER_PAGE,
};

/** Shape of Next's `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap(entry => entry.split(","))
    .map(entry => entry.trim())
    .filter(Boolean);
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function keepKnown<T extends string>(
  values: string[],
  allowed: readonly T[]
): T[] {
  const seen = new Set<string>();
  return values.filter((value): value is T => {
    if (seen.has(value) || !allowed.includes(value as T)) return false;
    seen.add(value);
    return true;
  });
}

/** Parses dollars from the URL into cents, ignoring junk and negatives. */
function parseMoney(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const dollars = Number(value);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

/**
 * Turns raw URL params into a validated query. Unknown values are dropped
 * rather than rejected — a hand-edited URL should degrade to a sane page, not
 * a 500.
 */
export function parseListingQuery(params: RawSearchParams = {}): ListingQuery {
  const sortCandidate = first(params.sort);
  const minCents = parseMoney(first(params.min));
  const maxCents = parseMoney(first(params.max));

  // A backwards range filters everything out, so normalise it instead.
  const rangeIsInverted =
    minCents !== null && maxCents !== null && minCents > maxCents;

  return {
    q: (first(params.q) ?? "").trim(),
    categories: keepKnown(toList(params.category), CATEGORIES),
    conditions: keepKnown(toList(params.condition), CONDITIONS),
    kinds: keepKnown(toList(params.kind), LISTING_KINDS),
    campus: first(params.campus)?.trim() || null,
    minCents: rangeIsInverted ? maxCents : minCents,
    maxCents: rangeIsInverted ? minCents : maxCents,
    sort: SORT_KEYS.includes(sortCandidate ?? "")
      ? (sortCandidate as SortKey)
      : DEFAULT_SORT,
    page: parsePositiveInt(first(params.page), 1),
    perPage: Math.min(
      parsePositiveInt(first(params.perPage), DEFAULT_PER_PAGE),
      48
    ),
  };
}

/** Serialises a query back to URL params, omitting anything at its default. */
export function buildSearchParams(query: ListingQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.categories.length)
    params.set("category", query.categories.join(","));
  if (query.conditions.length)
    params.set("condition", query.conditions.join(","));
  if (query.kinds.length) params.set("kind", query.kinds.join(","));
  if (query.campus) params.set("campus", query.campus);
  if (query.minCents !== null) params.set("min", String(query.minCents / 100));
  if (query.maxCents !== null) params.set("max", String(query.maxCents / 100));
  if (query.sort !== DEFAULT_SORT) params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  if (query.perPage !== DEFAULT_PER_PAGE)
    params.set("perPage", String(query.perPage));
  return params;
}

/** `?a=b` for a non-empty query, or the bare path for an empty one. */
export function buildHref(pathname: string, query: ListingQuery): string {
  const search = buildSearchParams(query).toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function countActiveFilters(query: ListingQuery): number {
  return (
    query.categories.length +
    query.conditions.length +
    query.kinds.length +
    (query.campus ? 1 : 0) +
    (query.minCents !== null ? 1 : 0) +
    (query.maxCents !== null ? 1 : 0)
  );
}

/**
 * Scores a listing against free-text search. Title matches outrank tag and
 * description matches so "chem" surfaces a chemistry textbook before an item
 * that merely mentions chemistry in its blurb. Returns 0 for no match.
 */
export function searchScore(listing: Listing, term: string): number {
  const needle = term.trim().toLowerCase();
  if (!needle) return 1;

  const words = needle.split(/\s+/);
  let score = 0;

  for (const word of words) {
    const title = listing.title.toLowerCase();
    if (title.includes(word)) {
      score += title.startsWith(word) ? 12 : 8;
      continue;
    }
    if (listing.tags.some(tag => tag.toLowerCase().includes(word))) {
      score += 5;
      continue;
    }
    if (listing.category.includes(word)) {
      score += 4;
      continue;
    }
    if (listing.description.toLowerCase().includes(word)) {
      score += 2;
      continue;
    }
    if (listing.wants.some(want => want.toLowerCase().includes(word))) {
      score += 2;
      continue;
    }
    // Every word has to land somewhere, otherwise it is not a match.
    return 0;
  }

  return score;
}

function withinPriceRange(listing: Listing, query: ListingQuery): boolean {
  if (query.minCents === null && query.maxCents === null) return true;
  // Free listings are $0; barter listings have no price and are excluded as
  // soon as the shopper expresses a price range.
  const cents =
    listing.kind === "free"
      ? 0
      : listing.kind === "barter"
        ? null
        : listing.priceCents;
  if (cents === null) return false;
  if (query.minCents !== null && cents < query.minCents) return false;
  if (query.maxCents !== null && cents > query.maxCents) return false;
  return true;
}

export function filterListings(
  listings: Listing[],
  query: ListingQuery
): Listing[] {
  return listings.filter(listing => {
    if (listing.status === "closed") return false;
    if (query.categories.length && !query.categories.includes(listing.category))
      return false;
    if (
      query.conditions.length &&
      !query.conditions.includes(listing.condition)
    )
      return false;
    if (query.kinds.length && !query.kinds.includes(listing.kind)) return false;
    if (query.campus && listing.campus !== query.campus) return false;
    if (!withinPriceRange(listing, query)) return false;
    if (query.q && searchScore(listing, query.q) === 0) return false;
    return true;
  });
}

function priceForSort(listing: Listing): number {
  if (listing.kind === "free") return 0;
  // Barter listings have no number; park them at the end of either ordering
  // rather than pretending they are free.
  if (listing.priceCents === null) return Number.POSITIVE_INFINITY;
  return listing.priceCents;
}

export function sortListings(
  listings: Listing[],
  query: ListingQuery
): Listing[] {
  const sorted = [...listings];

  // With a search term, relevance leads and the chosen sort breaks ties.
  if (query.q) {
    const scores = new Map(
      sorted.map(listing => [listing.id, searchScore(listing, query.q)])
    );
    sorted.sort((a, b) => {
      const delta = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
      return delta !== 0 ? delta : compareBySort(a, b, query.sort);
    });
    return sorted;
  }

  sorted.sort((a, b) => compareBySort(a, b, query.sort));
  return sorted;
}

function compareBySort(a: Listing, b: Listing, sort: SortKey): number {
  switch (sort) {
    case "price-asc":
      return priceForSort(a) - priceForSort(b);
    case "price-desc": {
      const [left, right] = [priceForSort(a), priceForSort(b)];
      // Infinity (barter) must not win a high-to-low sort.
      if (left === right) return 0;
      if (!Number.isFinite(left)) return 1;
      if (!Number.isFinite(right)) return -1;
      return right - left;
    }
    case "popular":
      return b.views - a.views;
    case "newest":
    default:
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  }
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export function paginate<T>(
  items: T[],
  page: number,
  perPage: number
): Page<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    total,
    page: safePage,
    perPage,
    totalPages,
  };
}

/** Filter → sort → paginate, the whole browse pipeline in one call. */
export function runListingQuery(
  listings: Listing[],
  query: ListingQuery
): Page<Listing> {
  const matched = filterListings(listings, query);
  const ordered = sortListings(matched, query);
  return paginate(ordered, query.page, query.perPage);
}
