import type { Listing } from "@/lib/types";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/** Formats cents as USD, dropping the ".00" on whole-dollar amounts. */
export function formatCents(cents: number): string {
  const formatted = currency.format(cents / 100);
  return formatted.endsWith(".00") ? formatted.slice(0, -3) : formatted;
}

/**
 * The headline price shown on a card. Barter and free listings have no price,
 * so they get a word instead of a number.
 */
export function formatListingPrice(
  listing: Pick<Listing, "kind" | "priceCents">
): string {
  if (listing.kind === "free") return "Free";
  if (listing.kind === "barter") return "Trade";
  if (listing.priceCents === null) return "—";
  return formatCents(listing.priceCents);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Compact "posted 3d ago" style timestamps. `now` is injectable so callers
 * (and tests) control the reference point instead of reading the clock here.
 */
export function formatRelativeTime(
  iso: string,
  now: Date | number = Date.now()
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";

  const elapsed = (typeof now === "number" ? now : now.getTime()) - then;
  if (elapsed < 0) return "just now";
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;
  return `${Math.floor(elapsed / WEEK)}w ago`;
}

/** Two-letter monogram used by the avatar fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const THUMBNAIL_GRADIENTS = [
  "from-emerald-400/40 to-teal-500/25",
  "from-orange-400/40 to-amber-500/25",
  "from-sky-400/40 to-indigo-500/25",
  "from-fuchsia-400/40 to-purple-500/25",
  "from-rose-400/40 to-red-500/25",
  "from-lime-400/40 to-green-500/25",
];

/**
 * Listings have no uploaded photos in this build, so each one gets a stable
 * gradient derived from its id — deterministic, so server and client render
 * the same thing and hydration stays quiet.
 */
export function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return THUMBNAIL_GRADIENTS[hash % THUMBNAIL_GRADIENTS.length];
}

export function pluralize(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
