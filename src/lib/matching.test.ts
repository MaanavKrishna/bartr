import { describe, expect, it } from "vitest";

import {
  criteriaFromWanted,
  EMPTY_CRITERIA,
  isAlertDue,
  listingsMatching,
  matchAll,
  matchListing,
  type MatchableListing,
  type MatchCriteria,
} from "@/lib/matching";

const HANOVER = { lat: 43.7044, lng: -72.2887 };
const BOSTON = { lat: 42.3505, lng: -71.1054 };

function listing(overrides: Partial<MatchableListing> = {}): MatchableListing {
  return {
    id: "l_1",
    title: "Steel road bike, 54cm",
    description: "Freshly tuned commuter bike with new bar tape.",
    kind: "sale",
    priceCents: 22000,
    wants: [],
    category: "bikes",
    condition: "good",
    campus: "Dartmouth College",
    meetupSpot: "Collis porch",
    tags: ["bike", "commuter"],
    sellerId: "u_1",
    status: "active",
    views: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    communityId: "c_dartmouth",
    latitude: HANOVER.lat,
    longitude: HANOVER.lng,
    ...overrides,
  };
}

const criteria = (overrides: Partial<MatchCriteria> = {}): MatchCriteria => ({
  ...EMPTY_CRITERIA,
  ...overrides,
});

describe("matchListing — gating", () => {
  it("matches an empty criteria set", () => {
    expect(matchListing(EMPTY_CRITERIA, listing()).matched).toBe(true);
  });

  it("never matches a non-active listing", () => {
    expect(
      matchListing(EMPTY_CRITERIA, listing({ status: "closed" })).matched
    ).toBe(false);
    expect(
      matchListing(EMPTY_CRITERIA, listing({ status: "pending" })).matched
    ).toBe(false);
  });

  it("respects a community restriction", () => {
    expect(
      matchListing(criteria({ communityId: "c_other" }), listing()).matched
    ).toBe(false);
    expect(
      matchListing(criteria({ communityId: "c_dartmouth" }), listing()).matched
    ).toBe(true);
  });

  it("filters by category, condition and kind", () => {
    expect(
      matchListing(criteria({ categories: ["dorm"] }), listing()).matched
    ).toBe(false);
    expect(
      matchListing(criteria({ conditions: ["new"] }), listing()).matched
    ).toBe(false);
    expect(matchListing(criteria({ kinds: ["free"] }), listing()).matched).toBe(
      false
    );
    expect(matchListing(criteria({ kinds: ["sale"] }), listing()).matched).toBe(
      true
    );
  });
});

describe("matchListing — budget", () => {
  it("respects a ceiling", () => {
    expect(matchListing(criteria({ maxCents: 10000 }), listing()).matched).toBe(
      false
    );
    expect(matchListing(criteria({ maxCents: 30000 }), listing()).matched).toBe(
      true
    );
  });

  it("counts a free listing as zero", () => {
    const free = listing({ kind: "free", priceCents: null });
    const result = matchListing(criteria({ maxCents: 100 }), free);
    expect(result.matched).toBe(true);
    expect(result.reasons).toContain("free");
  });

  it("excludes barter listings once a budget is set", () => {
    const barter = listing({ kind: "barter", priceCents: null });
    expect(matchListing(criteria({ maxCents: 30000 }), barter).matched).toBe(
      false
    );
  });

  it("includes barter listings when no budget is set", () => {
    const barter = listing({ kind: "barter", priceCents: null });
    expect(matchListing(EMPTY_CRITERIA, barter).matched).toBe(true);
  });

  it("respects a floor", () => {
    expect(matchListing(criteria({ minCents: 30000 }), listing()).matched).toBe(
      false
    );
  });
});

describe("matchListing — distance", () => {
  it("excludes a listing beyond the radius", () => {
    const result = matchListing(
      criteria({ origin: HANOVER, radiusM: 10_000 }),
      listing({ latitude: BOSTON.lat, longitude: BOSTON.lng })
    );
    expect(result.matched).toBe(false);
  });

  it("includes a listing inside the radius and reports the distance", () => {
    const result = matchListing(
      criteria({ origin: HANOVER, radiusM: 10_000 }),
      listing()
    );
    expect(result.matched).toBe(true);
    expect(result.distanceM).toBeLessThan(100);
    expect(result.reasons).toContain("nearby");
  });

  it("treats radius 0 as unlimited", () => {
    const result = matchListing(
      criteria({ origin: HANOVER, radiusM: 0 }),
      listing({ latitude: BOSTON.lat, longitude: BOSTON.lng })
    );
    expect(result.matched).toBe(true);
  });

  it("excludes a listing with no location from a distance-limited search", () => {
    const result = matchListing(
      criteria({ origin: HANOVER, radiusM: 5000 }),
      listing({ latitude: null, longitude: null })
    );
    expect(result.matched).toBe(false);
  });

  it("keeps a location-less listing when the radius is unlimited", () => {
    const result = matchListing(
      criteria({ origin: HANOVER, radiusM: 0 }),
      listing({ latitude: null, longitude: null })
    );
    expect(result.matched).toBe(true);
  });
});

describe("matchListing — text and explanation", () => {
  it("requires the text to match", () => {
    expect(
      matchListing(criteria({ text: "snowboard" }), listing()).matched
    ).toBe(false);
    expect(matchListing(criteria({ text: "bike" }), listing()).matched).toBe(
      true
    );
  });

  it("leads the reasons with the text match, for the alert email", () => {
    const result = matchListing(criteria({ text: "bike" }), listing());
    expect(result.reasons[0]).toBe('matches "bike"');
  });

  it("always explains why it matched", () => {
    const result = matchListing(
      criteria({
        text: "bike",
        categories: ["bikes"],
        origin: HANOVER,
        radiusM: 5000,
      }),
      listing()
    );
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("strength", () => {
  it("stays within 0-1", () => {
    const result = matchListing(
      criteria({ text: "bike", origin: HANOVER, radiusM: 10_000 }),
      listing()
    );
    expect(result.strength).toBeGreaterThan(0);
    expect(result.strength).toBeLessThanOrEqual(1);
  });

  it("ranks a nearer listing above an identical far one", () => {
    const near = matchListing(
      criteria({ text: "bike", origin: HANOVER, radiusM: 300_000 }),
      listing()
    );
    const far = matchListing(
      criteria({ text: "bike", origin: HANOVER, radiusM: 300_000 }),
      listing({ latitude: BOSTON.lat, longitude: BOSTON.lng })
    );
    expect(near.strength).toBeGreaterThan(far.strength);
  });
});

describe("matchAll — alert fan-out", () => {
  it("returns only matching watchers, strongest first", () => {
    const watchers = [
      { id: "w1", criteria: criteria({ text: "bike" }) },
      { id: "w2", criteria: criteria({ text: "snowboard" }) },
      { id: "w3", criteria: criteria({ categories: ["bikes"] }) },
    ];

    const matches = matchAll(watchers, listing());
    expect(matches.map(m => m.watcher.id)).toEqual(["w1", "w3"]);
    expect(matches[0].result.strength).toBeGreaterThanOrEqual(
      matches[1].result.strength
    );
  });

  it("returns nothing for a closed listing", () => {
    const watchers = [{ id: "w1", criteria: EMPTY_CRITERIA }];
    expect(matchAll(watchers, listing({ status: "closed" }))).toEqual([]);
  });
});

describe("listingsMatching — the wanted-post direction", () => {
  it("returns matching listings best first and respects the limit", () => {
    const listings = [
      listing({ id: "a", title: "Mountain bike" }),
      listing({
        id: "b",
        title: "Chemistry textbook",
        tags: [],
        category: "textbooks",
      }),
      listing({ id: "c", title: "Bike lock", tags: [] }),
    ];

    const results = listingsMatching(criteria({ text: "bike" }), listings, 2);
    expect(results).toHaveLength(2);
    expect(results.map(r => r.listing.id)).not.toContain("b");
  });
});

describe("criteriaFromWanted", () => {
  it("maps a wanted post onto criteria", () => {
    const result = criteriaFromWanted({
      title: "desk chair",
      category: "furniture",
      budgetCents: 6000,
      latitude: HANOVER.lat,
      longitude: HANOVER.lng,
      radiusM: 5000,
      communityId: "c_dartmouth",
    });

    expect(result.text).toBe("desk chair");
    expect(result.categories).toEqual(["furniture"]);
    expect(result.maxCents).toBe(6000);
    expect(result.origin).toEqual(HANOVER);
  });

  it("handles a wanted post with no location or category", () => {
    const result = criteriaFromWanted({
      title: "anything",
      category: null,
      budgetCents: null,
      latitude: null,
      longitude: null,
      radiusM: 0,
      communityId: null,
    });
    expect(result.origin).toBeNull();
    expect(result.categories).toEqual([]);
  });
});

describe("isAlertDue", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");

  it("never fires when off", () => {
    expect(isAlertDue("off", null, now)).toBe(false);
  });

  it("fires when never run", () => {
    expect(isAlertDue("daily", null, now)).toBe(true);
  });

  it("respects the daily interval", () => {
    expect(isAlertDue("daily", "2026-06-10T06:00:00.000Z", now)).toBe(false);
    expect(isAlertDue("daily", "2026-06-09T06:00:00.000Z", now)).toBe(true);
  });

  it("respects the weekly interval", () => {
    expect(isAlertDue("weekly", "2026-06-08T12:00:00.000Z", now)).toBe(false);
    expect(isAlertDue("weekly", "2026-06-01T12:00:00.000Z", now)).toBe(true);
  });

  it("is always due when instant", () => {
    expect(isAlertDue("instant", "2026-06-10T11:59:59.000Z", now)).toBe(true);
  });

  it("treats an unparseable timestamp as due rather than never firing", () => {
    expect(isAlertDue("daily", "not a date", now)).toBe(true);
  });
});
