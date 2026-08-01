import type { Category, Condition, ListingKind } from "@/lib/types";
import { CATEGORIES, CONDITIONS, LISTING_KINDS } from "@/lib/types";

/**
 * Display metadata for the domain enums. Kept next to the enums rather than
 * inline in components so labels stay consistent across cards, filters, forms
 * and detail pages.
 */

export const CATEGORY_META: Record<
  Category,
  { label: string; emoji: string; blurb: string }
> = {
  textbooks: {
    label: "Textbooks",
    emoji: "📚",
    blurb: "Course texts, lab manuals, readers",
  },
  electronics: {
    label: "Electronics",
    emoji: "💻",
    blurb: "Laptops, monitors, calculators, audio",
  },
  furniture: {
    label: "Furniture",
    emoji: "🪑",
    blurb: "Desks, chairs, shelves, lamps",
  },
  clothing: {
    label: "Clothing",
    emoji: "🧥",
    blurb: "Outerwear, formalwear, team gear",
  },
  bikes: {
    label: "Bikes",
    emoji: "🚲",
    blurb: "Bikes, scooters, locks, parts",
  },
  dorm: {
    label: "Dorm",
    emoji: "🛏️",
    blurb: "Bedding, fridges, storage, decor",
  },
  tickets: {
    label: "Tickets",
    emoji: "🎟️",
    blurb: "Games, formals, concerts, shuttles",
  },
  services: {
    label: "Services",
    emoji: "🛠️",
    blurb: "Tutoring, rides, repairs, haircuts",
  },
  other: { label: "Other", emoji: "✨", blurb: "Everything else" },
};

export const CONDITION_META: Record<Condition, { label: string }> = {
  new: { label: "New" },
  "like-new": { label: "Like new" },
  good: { label: "Good" },
  fair: { label: "Fair" },
  "for-parts": { label: "For parts" },
};

export const KIND_META: Record<
  ListingKind,
  { label: string; verb: string; emoji: string }
> = {
  sale: { label: "For sale", verb: "Buy", emoji: "💵" },
  barter: { label: "Barter", verb: "Trade", emoji: "🔄" },
  free: { label: "Free", verb: "Claim", emoji: "🎁" },
};

export const CAMPUSES = [
  "Dartmouth College",
  "Boston University",
  "UC Berkeley",
  "Georgia Tech",
  "UT Austin",
] as const;

export type Campus = (typeof CAMPUSES)[number];

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "popular", label: "Most viewed" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

/** Typed as `string[]` so membership checks accept raw URL values. */
export const SORT_KEYS: readonly string[] = SORT_OPTIONS.map(
  option => option.value
);

export const DEFAULT_SORT: SortKey = "newest";
export const DEFAULT_PER_PAGE = 12;

export { CATEGORIES, CONDITIONS, LISTING_KINDS };
