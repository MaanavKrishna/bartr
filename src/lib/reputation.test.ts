import { describe, expect, it } from "vitest";

import {
  computeReputation,
  describeReputation,
  shouldHeadlineScore,
  type RatingRecord,
  type ReputationInputs,
} from "@/lib/reputation";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function rating(overrides: Partial<RatingRecord> = {}): RatingRecord {
  return {
    score: 5,
    createdAt: daysAgo(30),
    communityId: "c_dartmouth",
    communityName: "Dartmouth",
    ...overrides,
  };
}

function inputs(overrides: Partial<ReputationInputs> = {}): ReputationInputs {
  return {
    ratings: [],
    emailVerified: true,
    studentCommunityIds: [],
    accountCreatedAt: daysAgo(400),
    completedTrades: 0,
    ...overrides,
  };
}

describe("no history", () => {
  it("returns null rather than a fake score", () => {
    const result = computeReputation(inputs(), NOW);
    expect(result.score).toBeNull();
    expect(result.ratingCount).toBe(0);
    expect(result.confidence).toBe(0);
    expect(describeReputation(result)).toBe("No trades yet");
  });

  it("still reports verification badges", () => {
    const result = computeReputation(
      inputs({ studentCommunityIds: ["c_dartmouth"] }),
      NOW
    );
    expect(result.badges).toContain("Email verified");
    expect(result.badges).toContain("Verified student");
  });
});

describe("small samples are not trusted", () => {
  it("does not let one perfect rating outrank a long clean history", () => {
    const rookie = computeReputation(
      inputs({ ratings: [rating({ score: 5 })] }),
      NOW
    );
    const veteran = computeReputation(
      inputs({
        ratings: Array.from({ length: 90 }, () => rating({ score: 4.7 })),
      }),
      NOW
    );

    expect(rookie.rawAverage).toBeGreaterThan(veteran.rawAverage!);
    // The adjusted score reverses it — which is the entire point.
    expect(veteran.score!).toBeGreaterThan(rookie.score!);
  });

  it("pulls a single rating toward the prior", () => {
    const result = computeReputation(
      inputs({ ratings: [rating({ score: 5 })] }),
      NOW
    );
    expect(result.score!).toBeLessThan(5);
    expect(result.score!).toBeGreaterThan(3.8);
  });

  it("raises confidence as evidence accumulates", () => {
    const few = computeReputation(
      inputs({ ratings: [rating(), rating()] }),
      NOW
    );
    const many = computeReputation(
      inputs({ ratings: Array.from({ length: 40 }, () => rating()) }),
      NOW
    );
    expect(many.confidence).toBeGreaterThan(few.confidence);
    expect(many.confidence).toBeLessThanOrEqual(1);
  });

  it("does not headline a score from one rating", () => {
    const rookie = computeReputation(inputs({ ratings: [rating()] }), NOW);
    expect(shouldHeadlineScore(rookie)).toBe(false);
  });

  it("headlines a score once there is real evidence", () => {
    const veteran = computeReputation(
      inputs({ ratings: Array.from({ length: 30 }, () => rating()) }),
      NOW
    );
    expect(shouldHeadlineScore(veteran)).toBe(true);
  });
});

describe("ageing", () => {
  it("weights recent ratings above old ones", () => {
    const recent = computeReputation(
      inputs({
        ratings: Array.from({ length: 10 }, () =>
          rating({ score: 5, createdAt: daysAgo(10) })
        ),
      }),
      NOW
    );
    const stale = computeReputation(
      inputs({
        ratings: Array.from({ length: 10 }, () =>
          rating({ score: 5, createdAt: daysAgo(1095) })
        ),
      }),
      NOW
    );

    expect(recent.score!).toBeGreaterThan(stale.score!);
    expect(recent.confidence).toBeGreaterThan(stale.confidence);
  });

  it("never discards old evidence entirely", () => {
    const ancient = computeReputation(
      inputs({
        ratings: Array.from({ length: 20 }, () =>
          rating({ score: 5, createdAt: daysAgo(2000) })
        ),
      }),
      NOW
    );
    expect(ancient.score!).toBeGreaterThan(3.8);
  });

  it("reports days since the most recent rating", () => {
    const result = computeReputation(
      inputs({
        ratings: [
          rating({ createdAt: daysAgo(400) }),
          rating({ createdAt: daysAgo(12) }),
        ],
      }),
      NOW
    );
    expect(result.daysSinceLastRating).toBe(12);
  });
});

describe("provenance — the portability story", () => {
  it("reports where reputation was earned, largest first", () => {
    const result = computeReputation(
      inputs({
        ratings: [
          ...Array.from({ length: 30 }, () => rating()),
          ...Array.from({ length: 4 }, () =>
            rating({ communityId: null, communityName: null })
          ),
        ],
      }),
      NOW
    );

    expect(result.provenance[0]).toMatchObject({
      communityName: "Dartmouth",
      count: 30,
    });
    expect(result.provenance[1]).toMatchObject({
      communityName: "the open marketplace",
      count: 4,
    });
  });

  it("carries student reputation into the open marketplace", () => {
    // The whole point: ratings earned on campus still count afterwards.
    const graduate = computeReputation(
      inputs({
        ratings: Array.from({ length: 25 }, () =>
          rating({ score: 4.9, communityId: "c_dartmouth" })
        ),
        completedTrades: 25,
      }),
      NOW
    );
    expect(graduate.score!).toBeGreaterThan(4.5);
    expect(shouldHeadlineScore(graduate)).toBe(true);
  });
});

describe("badges", () => {
  it("scales with trade count", () => {
    expect(
      computeReputation(inputs({ completedTrades: 6 }), NOW).badges
    ).toContain("5+ trades");
    expect(
      computeReputation(inputs({ completedTrades: 25 }), NOW).badges
    ).toContain("20+ trades");
    expect(
      computeReputation(inputs({ completedTrades: 80 }), NOW).badges
    ).toContain("50+ trades");
  });

  it("reflects account age", () => {
    expect(
      computeReputation(inputs({ accountCreatedAt: daysAgo(800) }), NOW).badges
    ).toContain("Member 2+ years");
    expect(
      computeReputation(inputs({ accountCreatedAt: daysAgo(10) }), NOW).badges
    ).not.toContain("Member 1+ year");
  });
});

describe("describeReputation", () => {
  it("leads with sample size, which a star rating hides", () => {
    const result = computeReputation(
      inputs({
        ratings: Array.from({ length: 34 }, () => rating({ score: 4.9 })),
      }),
      NOW
    );
    const text = describeReputation(result);
    expect(text).toContain("34 trades");
    expect(text).toContain("Dartmouth");
  });

  it("flags a dormant profile", () => {
    const result = computeReputation(
      inputs({
        ratings: Array.from({ length: 10 }, () =>
          rating({ createdAt: daysAgo(500) })
        ),
      }),
      NOW
    );
    expect(describeReputation(result)).toContain("none in the last year");
  });

  it("uses the singular for one trade", () => {
    const result = computeReputation(inputs({ ratings: [rating()] }), NOW);
    expect(describeReputation(result)).toContain("1 trade");
  });
});

describe("robustness", () => {
  it("ignores out-of-range scores", () => {
    const result = computeReputation(
      inputs({
        ratings: [
          rating({ score: 9 }),
          rating({ score: 0 }),
          rating({ score: 4 }),
        ],
      }),
      NOW
    );
    expect(result.ratingCount).toBe(1);
  });

  it("survives an unparseable timestamp", () => {
    const result = computeReputation(
      inputs({ ratings: [rating({ createdAt: "not a date" })] }),
      NOW
    );
    expect(result.score).not.toBeNull();
    expect(Number.isFinite(result.score!)).toBe(true);
  });
});
