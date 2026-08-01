import { describe, expect, it } from "vitest";

import {
  formatCents,
  formatListingPrice,
  formatRelativeTime,
  gradientFor,
  initials,
  pluralize,
} from "@/lib/format";

describe("formatCents", () => {
  it("drops the decimals on whole dollars", () => {
    expect(formatCents(4500)).toBe("$45");
    expect(formatCents(0)).toBe("$0");
  });

  it("keeps the decimals when they matter", () => {
    expect(formatCents(4599)).toBe("$45.99");
    expect(formatCents(50)).toBe("$0.50");
  });

  it("groups thousands", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
  });
});

describe("formatListingPrice", () => {
  it("uses a word for listings with no price", () => {
    expect(formatListingPrice({ kind: "free", priceCents: null })).toBe("Free");
    expect(formatListingPrice({ kind: "barter", priceCents: null })).toBe(
      "Trade"
    );
  });

  it("formats sale prices", () => {
    expect(formatListingPrice({ kind: "sale", priceCents: 22000 })).toBe(
      "$220"
    );
  });

  it("degrades gracefully on a sale listing missing its price", () => {
    expect(formatListingPrice({ kind: "sale", priceCents: null })).toBe("—");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("handles each bucket", () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe("just now");
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe("5m ago");
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe("3h ago");
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toBe("2d ago");
    expect(formatRelativeTime(ago(3 * 7 * 86_400_000), now)).toBe("3w ago");
  });

  it("does not produce negative ages for future timestamps", () => {
    expect(formatRelativeTime("2026-06-02T12:00:00.000Z", now)).toBe(
      "just now"
    );
  });

  it("survives an unparseable date", () => {
    expect(formatRelativeTime("not a date", now)).toBe("unknown");
  });
});

describe("initials", () => {
  it("uses the first and last name", () => {
    expect(initials("Amara Osei")).toBe("AO");
    expect(initials("Priya Raghunathan Iyer")).toBe("PI");
  });

  it("falls back to two letters for a single name", () => {
    expect(initials("Wren")).toBe("WR");
  });

  it("handles empty input", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("gradientFor", () => {
  it("is stable for the same id", () => {
    expect(gradientFor("l_road_bike")).toBe(gradientFor("l_road_bike"));
  });

  it("returns a tailwind gradient pair", () => {
    expect(gradientFor("anything")).toMatch(/^from-\S+ to-\S+$/);
  });
});

describe("pluralize", () => {
  it("switches on the count", () => {
    expect(pluralize(1, "listing")).toBe("1 listing");
    expect(pluralize(0, "listing")).toBe("0 listings");
    expect(pluralize(3, "match", "matches")).toBe("3 matches");
  });
});
