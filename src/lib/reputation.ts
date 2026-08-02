/**
 * Portable reputation.
 *
 * Ratings are stored globally rather than per-community, so a student's
 * history already follows them into the universal marketplace when they
 * graduate. That is the easy half. The hard half is making a cross-context
 * score *trustworthy*, which a raw average is not:
 *
 * - A 5.0 from one trade is not better than a 4.7 from ninety. Naive averages
 *   put the one-trade account on top, which is exactly the account a scammer
 *   can manufacture. This uses a Bayesian average that pulls small samples
 *   toward the global mean until they earn their way out.
 * - Reputation should age. Someone excellent three years ago and absent since
 *   is a weaker signal than someone excellent last month.
 * - A score with no provenance is unreadable. "4.8" means little; "4.8 from 34
 *   trades, mostly at Dartmouth, active this month" is something a stranger
 *   can actually act on.
 */

export interface RatingRecord {
  score: number;
  createdAt: string;
  /** Where it was earned, for provenance. Null for the open marketplace. */
  communityId: string | null;
  communityName?: string | null;
}

export interface ReputationInputs {
  ratings: RatingRecord[];
  emailVerified: boolean;
  /** Community ids where a student credential is verified. */
  studentCommunityIds: string[];
  accountCreatedAt: string;
  completedTrades: number;
}

export interface ReputationProvenance {
  communityId: string | null;
  communityName: string;
  count: number;
}

export interface Reputation {
  /** Confidence-adjusted score out of 5, or null with no ratings at all. */
  score: number | null;
  /** The plain arithmetic mean, for transparency alongside the adjusted one. */
  rawAverage: number | null;
  ratingCount: number;
  /** 0-1: how much weight a reader should put on the score. */
  confidence: number;
  /** Where the reputation was earned, largest first. */
  provenance: ReputationProvenance[];
  /** Short, human phrases for a profile card. */
  badges: string[];
  /** Days since the most recent rating, or null if never rated. */
  daysSinceLastRating: number | null;
}

/**
 * Prior for the Bayesian average. `PRIOR_WEIGHT` behaves like that many
 * imaginary ratings at `PRIOR_MEAN`: a new account starts near the middle and
 * has to trade its way to a high score.
 */
const PRIOR_MEAN = 3.8;
const PRIOR_WEIGHT = 5;

/** Ratings older than this contribute at a reduced weight. */
const HALF_LIFE_DAYS = 365;

const DAY_MS = 86_400_000;

function daysBetween(from: number, to: number): number {
  return Math.max(0, (to - from) / DAY_MS);
}

/**
 * Exponential decay: a rating a year old counts half, two years a quarter.
 * Never reaches zero — old evidence is weaker, not worthless.
 */
function ageWeight(createdAt: string, now: number): number {
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return 1;
  return 0.5 ** (daysBetween(at, now) / HALF_LIFE_DAYS);
}

export function computeReputation(
  inputs: ReputationInputs,
  now: Date = new Date()
): Reputation {
  const nowMs = now.getTime();
  const ratings = inputs.ratings.filter(
    rating => rating.score >= 1 && rating.score <= 5
  );

  const badges = buildBadges(inputs, nowMs);

  if (ratings.length === 0) {
    return {
      score: null,
      rawAverage: null,
      ratingCount: 0,
      confidence: 0,
      provenance: [],
      badges,
      daysSinceLastRating: null,
    };
  }

  let weightSum = 0;
  let weightedScoreSum = 0;
  let plainSum = 0;
  let newest = 0;

  for (const rating of ratings) {
    const weight = ageWeight(rating.createdAt, nowMs);
    weightSum += weight;
    weightedScoreSum += rating.score * weight;
    plainSum += rating.score;

    const at = Date.parse(rating.createdAt);
    if (!Number.isNaN(at) && at > newest) newest = at;
  }

  // Bayesian average against the prior, using age-weighted evidence.
  const adjusted =
    (PRIOR_MEAN * PRIOR_WEIGHT + weightedScoreSum) / (PRIOR_WEIGHT + weightSum);

  return {
    score: round1(adjusted),
    rawAverage: round1(plainSum / ratings.length),
    ratingCount: ratings.length,
    confidence: round2(weightSum / (weightSum + PRIOR_WEIGHT)),
    provenance: buildProvenance(ratings),
    badges,
    daysSinceLastRating: newest ? Math.floor(daysBetween(newest, nowMs)) : null,
  };
}

function buildProvenance(ratings: RatingRecord[]): ReputationProvenance[] {
  const byCommunity = new Map<string, ReputationProvenance>();

  for (const rating of ratings) {
    const key = rating.communityId ?? "__public__";
    const existing = byCommunity.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byCommunity.set(key, {
      communityId: rating.communityId,
      communityName: rating.communityName ?? "the open marketplace",
      count: 1,
    });
  }

  return [...byCommunity.values()].sort((a, b) => b.count - a.count);
}

function buildBadges(inputs: ReputationInputs, nowMs: number): string[] {
  const badges: string[] = [];

  if (inputs.emailVerified) badges.push("Email verified");
  if (inputs.studentCommunityIds.length > 0) badges.push("Verified student");

  const ageDays = daysBetween(Date.parse(inputs.accountCreatedAt), nowMs);
  if (Number.isFinite(ageDays)) {
    if (ageDays >= 730) badges.push("Member 2+ years");
    else if (ageDays >= 365) badges.push("Member 1+ year");
  }

  if (inputs.completedTrades >= 50) badges.push("50+ trades");
  else if (inputs.completedTrades >= 20) badges.push("20+ trades");
  else if (inputs.completedTrades >= 5) badges.push("5+ trades");

  return badges;
}

/**
 * One line a stranger can read. Deliberately leads with sample size, because
 * that is the part a naive star rating hides.
 */
export function describeReputation(reputation: Reputation): string {
  if (reputation.score === null) {
    return "No trades yet";
  }

  const trades =
    reputation.ratingCount === 1
      ? "1 trade"
      : `${reputation.ratingCount} trades`;

  const where = reputation.provenance[0];
  const place = where ? ` mostly at ${where.communityName}` : "";

  const recency =
    reputation.daysSinceLastRating !== null &&
    reputation.daysSinceLastRating > 365
      ? ", none in the last year"
      : "";

  return `${reputation.score.toFixed(1)} from ${trades}${place}${recency}`;
}

/**
 * Whether a score should be shown as a headline number at all. Below this,
 * showing "5.0" is actively misleading — the profile should show the trade
 * count instead.
 */
export const MIN_CONFIDENCE_TO_HEADLINE = 0.5;

export function shouldHeadlineScore(reputation: Reputation): boolean {
  return (
    reputation.score !== null &&
    reputation.confidence >= MIN_CONFIDENCE_TO_HEADLINE
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
