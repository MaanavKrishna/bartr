import { describe, expect, it } from "vitest";

import {
  boundingBox,
  DEFAULT_RADIUS_M,
  formatDistance,
  formatPoint,
  formatRadius,
  haversineMetres,
  isUnlimitedRadius,
  isValidPoint,
  MAX_RADIUS_M,
  parsePoint,
  parseRadius,
} from "@/lib/geo";

const HANOVER = { lat: 43.7044, lng: -72.2887 };
const BOSTON = { lat: 42.3505, lng: -71.1054 };

describe("parsePoint", () => {
  it("parses a well-formed pair", () => {
    expect(parsePoint("43.7044,-72.2887")).toEqual(HANOVER);
  });

  it("rejects malformed input rather than throwing", () => {
    expect(parsePoint(undefined)).toBeNull();
    expect(parsePoint("")).toBeNull();
    expect(parsePoint("43.7044")).toBeNull();
    expect(parsePoint("43.7044,-72.2887,12")).toBeNull();
    expect(parsePoint("here,there")).toBeNull();
  });

  it("rejects out-of-range coordinates", () => {
    expect(parsePoint("91,0")).toBeNull();
    expect(parsePoint("0,181")).toBeNull();
    expect(parsePoint("-91,0")).toBeNull();
  });

  it("accepts the extremes", () => {
    expect(parsePoint("90,180")).toEqual({ lat: 90, lng: 180 });
    expect(parsePoint("-90,-180")).toEqual({ lat: -90, lng: -180 });
  });

  it("round-trips through formatPoint", () => {
    expect(parsePoint(formatPoint(HANOVER))).toEqual(HANOVER);
  });
});

describe("isValidPoint", () => {
  it("rejects null and partial points", () => {
    expect(isValidPoint(null)).toBe(false);
    expect(isValidPoint({ lat: 43 })).toBe(false);
    expect(isValidPoint({ lat: NaN, lng: 0 })).toBe(false);
  });

  it("accepts a complete point", () => {
    expect(isValidPoint(HANOVER)).toBe(true);
  });
});

describe("parseRadius", () => {
  it("falls back on missing or junk values", () => {
    expect(parseRadius(undefined)).toBe(DEFAULT_RADIUS_M);
    expect(parseRadius("")).toBe(DEFAULT_RADIUS_M);
    expect(parseRadius("near")).toBe(DEFAULT_RADIUS_M);
    expect(parseRadius("-500")).toBe(DEFAULT_RADIUS_M);
  });

  it("keeps 0 as the unlimited sentinel", () => {
    expect(parseRadius("0")).toBe(0);
    expect(isUnlimitedRadius(parseRadius("0"))).toBe(true);
  });

  it("clamps to the maximum", () => {
    expect(parseRadius("99999999")).toBe(MAX_RADIUS_M);
  });

  it("accepts a value in range", () => {
    expect(parseRadius("5000")).toBe(5000);
  });
});

describe("haversineMetres", () => {
  it("is zero for the same point", () => {
    expect(haversineMetres(HANOVER, HANOVER)).toBe(0);
  });

  it("matches the known Hanover-Boston distance", () => {
    // PostGIS reports 178.7 km for this pair; agreeing within 1% confirms the
    // client-side estimate and the database are measuring the same thing.
    const km = haversineMetres(HANOVER, BOSTON) / 1000;
    expect(km).toBeGreaterThan(177);
    expect(km).toBeLessThan(180);
  });

  it("is symmetric", () => {
    expect(haversineMetres(HANOVER, BOSTON)).toBeCloseTo(
      haversineMetres(BOSTON, HANOVER),
      6
    );
  });

  it("handles antipodal points without NaN", () => {
    const d = haversineMetres({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d / 1000).toBeGreaterThan(20_000);
  });
});

describe("formatDistance", () => {
  it("uses words up close and rounds sensibly further out", () => {
    expect(formatDistance(40)).toBe("right here");
    expect(formatDistance(830)).toBe("850 m");
    expect(formatDistance(2500)).toBe("2.5 km");
    expect(formatDistance(178_700)).toBe("179 km");
  });

  it("returns empty for nonsense input", () => {
    expect(formatDistance(-1)).toBe("");
    expect(formatDistance(NaN)).toBe("");
  });
});

describe("formatRadius", () => {
  it("names the preset options", () => {
    expect(formatRadius(0)).toBe("Anywhere");
    expect(formatRadius(16000)).toBe("16 km");
  });

  it("falls back to a computed label", () => {
    expect(formatRadius(300)).toBe("300 m");
    expect(formatRadius(24000)).toBe("24 km");
  });
});

describe("boundingBox", () => {
  it("contains the centre", () => {
    const box = boundingBox(HANOVER, 10_000);
    expect(box.minLat).toBeLessThan(HANOVER.lat);
    expect(box.maxLat).toBeGreaterThan(HANOVER.lat);
    expect(box.minLng).toBeLessThan(HANOVER.lng);
    expect(box.maxLng).toBeGreaterThan(HANOVER.lng);
  });

  it("widens longitude towards the poles", () => {
    const equator = boundingBox({ lat: 0, lng: 0 }, 10_000);
    const arctic = boundingBox({ lat: 80, lng: 0 }, 10_000);
    expect(arctic.maxLng - arctic.minLng).toBeGreaterThan(
      equator.maxLng - equator.minLng
    );
  });

  it("never runs past the poles", () => {
    const box = boundingBox({ lat: 89.9, lng: 0 }, 100_000);
    expect(box.maxLat).toBeLessThanOrEqual(90);
    expect(box.minLat).toBeGreaterThanOrEqual(-90);
  });
});
