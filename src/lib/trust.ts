/**
 * Listing trust signals.
 *
 * A marketplace's real failure mode is not bad code, it is a convincing scam.
 * This module scores a listing against the patterns that actually show up:
 * pulling the conversation off-platform, demanding an irreversible payment
 * method, a price too good to be true, and manufactured urgency.
 *
 * Two deliberate design choices:
 *
 * 1. **Signals, not a verdict.** Every check returns evidence with a weight.
 *    Nothing here auto-deletes anything, because false positives on a student
 *    selling a cheap textbook are worse than a slow manual review.
 * 2. **Pure and inspectable.** No database, no model, no network. It runs on a
 *    listing draft before it is even saved, so the seller can be warned as
 *    they type, and every decision can be explained to a human reviewer.
 */

import type { Category, ListingKind } from "@/lib/types";

export const RISK_LEVELS = ["clear", "low", "review", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export interface TrustSignal {
  code: string;
  /** Shown to a moderator, and to the seller when the signal is self-fixable. */
  message: string;
  weight: number;
  /** True when the seller can act on it themselves before posting. */
  actionable: boolean;
}

export interface TrustAssessment {
  score: number;
  level: RiskLevel;
  signals: TrustSignal[];
  /** Signals the seller can fix, for inline warnings on the compose form. */
  warnings: TrustSignal[];
}

export interface ListingDraft {
  title: string;
  description: string;
  kind: ListingKind;
  priceCents: number | null;
  category: Category;
  imageCount: number;
}

export interface SellerContext {
  emailVerified: boolean;
  studentVerified: boolean;
  accountAgeDays: number;
  completedTrades: number;
  ratingAvg: number | null;
  priorListingCount: number;
}

/**
 * Rough resale medians in cents, used only to spot prices that are
 * *implausibly* low — the classic bait. Deliberately coarse: this flags for
 * review, it never blocks.
 */
const CATEGORY_TYPICAL_CENTS: Record<Category, number> = {
  textbooks: 4000,
  electronics: 20000,
  furniture: 8000,
  clothing: 4000,
  bikes: 20000,
  dorm: 4000,
  tickets: 6000,
  services: 5000,
  other: 5000,
};

/** Contact details in the body: the strongest single off-platform signal. */
const CONTACT_PATTERNS: Array<{
  pattern: RegExp;
  code: string;
  message: string;
}> = [
  {
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/,
    code: "contact_email",
    message: "The description contains an email address.",
  },
  {
    // Seven or more digits with common separators — a phone number.
    pattern: /(?:\+?\d[\s().-]?){7,}\d/,
    code: "contact_phone",
    message: "The description contains what looks like a phone number.",
  },
  {
    pattern:
      /\b(whats\s?app|telegram|signal|kik|snap(chat)?|insta(gram)?|dm me)\b/i,
    code: "contact_offsite",
    message: "The description points to another messaging app.",
  },
];

/** Payment rails with no buyer protection — where marketplace fraud lands. */
const PAYMENT_PATTERNS: Array<{
  pattern: RegExp;
  code: string;
  message: string;
}> = [
  {
    pattern:
      /\b(zelle|cash\s?app|venmo\s+friends|wire\s+transfer|western\s+union|money\s?gram)\b/i,
    code: "payment_irreversible",
    message: "Asks for a payment method with no buyer protection.",
  },
  {
    pattern: /\b(gift\s?card|steam\s?card|itunes\s?card|apple\s?card)\b/i,
    code: "payment_gift_card",
    message: "Asks for gift cards — effectively always a scam.",
  },
  {
    pattern: /\b(crypto|bitcoin|btc|eth|usdt|binance)\b/i,
    code: "payment_crypto",
    message: "Asks for cryptocurrency payment.",
  },
  {
    pattern:
      /\b(deposit|pay\s+(?:up\s?)?front|advance\s+payment)\b.{0,40}\b(hold|reserve|secure)\b/i,
    code: "payment_upfront_hold",
    message: "Asks for money up front to hold the item.",
  },
];

const URGENCY_PATTERN =
  /\b(today\s+only|must\s+go\s+(?:today|now)|urgent(?:ly)?|leaving\s+(?:the\s+)?country|first\s+come\s+first\s+serve[d]?|act\s+fast|limited\s+time)\b/i;

const SHIPPING_PATTERN =
  /\b(ship(?:ping|ped)?\s+(?:only|worldwide|internationally)|courier|no\s+meet\s?ups?|cannot\s+meet)\b/i;

/** Runs every check and returns the evidence. */
export function assessListing(
  draft: ListingDraft,
  seller: SellerContext
): TrustAssessment {
  const signals: TrustSignal[] = [];
  const haystack = `${draft.title}\n${draft.description}`;

  for (const { pattern, code, message } of CONTACT_PATTERNS) {
    if (pattern.test(haystack)) {
      signals.push({
        code,
        message,
        weight: 25,
        actionable: true,
      });
    }
  }

  for (const { pattern, code, message } of PAYMENT_PATTERNS) {
    if (pattern.test(haystack)) {
      signals.push({
        code,
        message,
        // A gift-card demand is fraud often enough to stand alone: 60 puts it
        // at `high` by itself, with no other signal needed. Crypto is close
        // behind but has occasional honest uses.
        weight:
          code === "payment_gift_card"
            ? 60
            : code === "payment_crypto"
              ? 45
              : 30,
        actionable: false,
      });
    }
  }

  // A meet-up marketplace that refuses to meet is the whole scam in one line.
  if (SHIPPING_PATTERN.test(haystack)) {
    signals.push({
      code: "no_meetup",
      message: "Refuses an in-person handoff, or offers shipping only.",
      weight: 25,
      actionable: false,
    });
  }

  if (URGENCY_PATTERN.test(haystack)) {
    signals.push({
      code: "urgency",
      message: "Uses urgency pressure to rush the buyer.",
      weight: 10,
      actionable: false,
    });
  }

  // Price far below what the category ever goes for.
  if (
    draft.kind === "sale" &&
    draft.priceCents !== null &&
    draft.priceCents > 0
  ) {
    const typical = CATEGORY_TYPICAL_CENTS[draft.category];
    const ratio = draft.priceCents / typical;
    if (ratio < 0.08) {
      signals.push({
        code: "price_implausible",
        message: "Priced far below anything comparable in this category.",
        weight: 25,
        actionable: false,
      });
    } else if (ratio < 0.2) {
      signals.push({
        code: "price_low",
        message: "Priced well below the usual range for this category.",
        weight: 10,
        actionable: false,
      });
    }
  }

  if (draft.imageCount === 0) {
    signals.push({
      code: "no_images",
      message: "No photos. Listings with photos get far more trust and offers.",
      weight: 12,
      actionable: true,
    });
  }

  const words = draft.description.trim().split(/\s+/).filter(Boolean).length;
  if (words < 12) {
    signals.push({
      code: "thin_description",
      message: "The description is very short.",
      weight: 8,
      actionable: true,
    });
  }

  if (isShouting(draft.title)) {
    signals.push({
      code: "shouting_title",
      message: "The title is mostly capital letters.",
      weight: 5,
      actionable: true,
    });
  }

  // Seller history. A brand-new account is not suspicious by itself, but it
  // removes the evidence that would otherwise offset a weak signal.
  if (!seller.emailVerified) {
    signals.push({
      code: "seller_unverified_email",
      message: "Seller has not confirmed their email address.",
      weight: 20,
      actionable: true,
    });
  }

  if (seller.accountAgeDays < 1 && seller.completedTrades === 0) {
    signals.push({
      code: "seller_brand_new",
      message: "Account created today with no completed trades.",
      weight: 12,
      actionable: false,
    });
  }

  if (
    seller.ratingAvg !== null &&
    seller.ratingAvg < 2.5 &&
    seller.completedTrades >= 3
  ) {
    signals.push({
      code: "seller_poor_rating",
      message: "Seller has a consistently poor rating.",
      weight: 20,
      actionable: false,
    });
  }

  // Earned trust forgives a thin description or a missing photo. It must never
  // forgive a gift-card demand, so credit is applied only to soft signals and
  // severe ones pass through undiscounted.
  const severe = sumWeights(signals.filter(s => s.weight >= SEVERE_WEIGHT));
  const soft = sumWeights(signals.filter(s => s.weight < SEVERE_WEIGHT));
  const score = Math.max(
    0,
    Math.min(100, severe + Math.max(0, soft - trustCredit(seller)))
  );

  return {
    score,
    level: levelFor(score),
    signals: [...signals].sort((a, b) => b.weight - a.weight),
    warnings: signals.filter(signal => signal.actionable),
  };
}

/** At or above this weight, a signal is not discountable by reputation. */
const SEVERE_WEIGHT = 25;

function sumWeights(signals: TrustSignal[]): number {
  return signals.reduce((sum, signal) => sum + signal.weight, 0);
}

/**
 * Earned trust offsets weak signals. A verified student with twenty clean
 * trades writing a short description is not a scammer.
 */
function trustCredit(seller: SellerContext): number {
  let credit = 0;
  if (seller.emailVerified) credit += 5;
  if (seller.studentVerified) credit += 10;
  if (seller.completedTrades >= 5) credit += 10;
  if (seller.completedTrades >= 20) credit += 10;
  if (seller.ratingAvg !== null && seller.ratingAvg >= 4.5) credit += 10;
  if (seller.accountAgeDays >= 180) credit += 5;
  return credit;
}

function levelFor(score: number): RiskLevel {
  if (score >= 60) return "high";
  if (score >= 30) return "review";
  if (score >= 12) return "low";
  return "clear";
}

function isShouting(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.7;
}

/** Whether a listing should go live immediately or wait for a human. */
export function shouldHoldForReview(assessment: TrustAssessment): boolean {
  return assessment.level === "high" || assessment.level === "review";
}

/**
 * Near-duplicate detection over normalised text. Scammers repost the same body
 * across many accounts; comparing shingles catches that even when names,
 * prices and emoji change.
 */
export function textSimilarity(a: string, b: string): number {
  const left = shingles(a);
  const right = shingles(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;

  // Jaccard: shared over the union.
  return shared / (left.size + right.size - shared);
}

function shingles(text: string, size = 3): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const set = new Set<string>();
  if (words.length < size) {
    if (words.length) set.add(words.join(" "));
    return set;
  }
  for (let i = 0; i <= words.length - size; i += 1) {
    set.add(words.slice(i, i + size).join(" "));
  }
  return set;
}

export const DUPLICATE_THRESHOLD = 0.6;

export function isLikelyDuplicate(a: string, b: string): boolean {
  return textSimilarity(a, b) >= DUPLICATE_THRESHOLD;
}
