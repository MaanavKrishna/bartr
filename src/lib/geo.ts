/**
 * Location helpers.
 *
 * Distances are metres everywhere internally, for the same reason money is
 * cents: one unit, no ambiguity, conversion only at the edges. The database
 * does the real proximity work through PostGIS; these functions cover
 * validation, display, and the URL round-trip.
 */

export interface Point {
  lat: number;
  lng: number;
}

/** Radii offered in the UI, in metres. */
export const RADIUS_OPTIONS = [
  { value: 1000, label: "1 km" },
  { value: 5000, label: "5 km" },
  { value: 16000, label: "16 km" },
  { value: 50000, label: "50 km" },
  { value: 160000, label: "160 km" },
  { value: 0, label: "Anywhere" },
] as const;

export const DEFAULT_RADIUS_M = 16000;
export const MAX_RADIUS_M = 160000;

/** 0 is the sentinel for "no distance filter at all". */
export function isUnlimitedRadius(radiusM: number): boolean {
  return radiusM === 0;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidPoint(point: Partial<Point> | null): point is Point {
  if (!point) return false;
  return (
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    isValidLatitude(point.lat) &&
    isValidLongitude(point.lng)
  );
}

/**
 * Parses "lat,lng" from a URL parameter. Returns null for anything malformed
 * rather than throwing — a hand-edited URL should degrade, not 500.
 */
export function parsePoint(value: string | undefined | null): Point | null {
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!isValidLatitude(lat) || !isValidLongitude(lng)) return null;
  return { lat, lng };
}

/** Serialises a point for the URL, trimmed to ~11 m of precision. */
export function formatPoint(point: Point): string {
  return `${round(point.lat)},${round(point.lng)}`;
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/** Clamps a raw radius from the URL into something the UI can represent. */
export function parseRadius(
  value: string | undefined | null,
  fallback = DEFAULT_RADIUS_M
): number {
  if (value === undefined || value === null || value.trim() === "")
    return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  if (parsed === 0) return 0;
  return Math.min(Math.round(parsed), MAX_RADIUS_M);
}

/**
 * Great-circle distance in metres.
 *
 * PostGIS computes the distances that matter (it is doing so on an indexed
 * column, over the whole table); this exists for client-side display and for
 * tests that need an oracle without a database.
 */
export function haversineMetres(a: Point, b: Point): number {
  const R = 6_371_008.8; // IUGG mean Earth radius.
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "Right here" / "800 m" / "12 km" — the phrasing used on cards. */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "";
  if (metres < 100) return "right here";
  if (metres < 1000) return `${Math.round(metres / 50) * 50} m`;
  if (metres < 10_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres / 1000)} km`;
}

export function formatRadius(metres: number): string {
  if (isUnlimitedRadius(metres)) return "Anywhere";
  const match = RADIUS_OPTIONS.find(option => option.value === metres);
  if (match) return match.label;
  return metres < 1000 ? `${metres} m` : `${Math.round(metres / 1000)} km`;
}

/**
 * Bounding box around a point, in degrees. Not used for the query itself —
 * PostGIS handles that — but useful for fitting a map to a search area.
 */
export function boundingBox(centre: Point, radiusM: number) {
  const latDelta = radiusM / 111_320;
  // Longitude degrees shrink towards the poles.
  const lngDelta =
    radiusM /
    (111_320 * Math.max(0.01, Math.cos((centre.lat * Math.PI) / 180)));

  return {
    minLat: Math.max(-90, centre.lat - latDelta),
    maxLat: Math.min(90, centre.lat + latDelta),
    minLng: Math.max(-180, centre.lng - lngDelta),
    maxLng: Math.min(180, centre.lng + lngDelta),
  };
}
