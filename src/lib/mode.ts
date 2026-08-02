/**
 * Bartr runs as two marketplaces from one codebase.
 *
 *   /            → Universal. Anyone with a confirmed email. Listings are
 *                  found by location and radius, like a city marketplace.
 *   /students    → Students. Requires a verified `.edu` (or equivalent)
 *                  address, and scopes listings to that university.
 *
 * The difference is entirely data plus one posting rule — see `communities` in
 * the schema. Nothing about search, listings or offers forks between the two,
 * which is why this file is small: it resolves which mode a request is in and
 * what that mode is allowed to do, and everything downstream takes it as a
 * parameter.
 */

export const MARKETPLACE_MODES = ["universal", "students"] as const;
export type MarketplaceMode = (typeof MARKETPLACE_MODES)[number];

export interface ModeConfig {
  mode: MarketplaceMode;
  /** URL prefix. Empty string for the universal marketplace at the root. */
  basePath: string;
  name: string;
  tagline: string;
  /** Whether posting requires a verified student email. */
  requiresStudentVerification: boolean;
  /** Community kind a listing in this mode belongs to. */
  communityKind: "public" | "university";
}

export const MODES: Record<MarketplaceMode, ModeConfig> = {
  universal: {
    mode: "universal",
    basePath: "",
    name: "Bartr",
    tagline: "Buy, sell and trade with people near you.",
    requiresStudentVerification: false,
    communityKind: "public",
  },
  students: {
    mode: "students",
    basePath: "/students",
    name: "Bartr for Students",
    tagline: "Your campus marketplace. Students only, verified by email.",
    requiresStudentVerification: true,
    communityKind: "university",
  },
};

export const DEFAULT_MODE: MarketplaceMode = "universal";

/** Resolves the mode from a pathname. `/students...` is the only special case. */
export function modeFromPathname(pathname: string): MarketplaceMode {
  return pathname === "/students" || pathname.startsWith("/students/")
    ? "students"
    : "universal";
}

export function modeConfig(mode: MarketplaceMode): ModeConfig {
  return MODES[mode];
}

/** Builds a path inside a mode: `href("students", "/browse")` → `/students/browse`. */
export function href(mode: MarketplaceMode, path = "/"): string {
  const base = MODES[mode].basePath;
  if (path === "/") return base || "/";
  return `${base}${path}`;
}

/**
 * Academic address check.
 *
 * `.edu` covers the US; the rest of the world uses second-level domains like
 * `ac.uk`, `edu.au`, `ac.jp`. This list is deliberately conservative — a real
 * deployment should verify against a registry of institution domains (see
 * `communities.email_domain`) rather than trusting the suffix alone, because
 * suffix matching cannot tell a university from a company that bought an
 * academic-looking domain.
 */
const ACADEMIC_SUFFIXES = [
  ".edu",
  ".ac.uk",
  ".ac.jp",
  ".ac.in",
  ".ac.nz",
  ".ac.za",
  ".ac.kr",
  ".edu.au",
  ".edu.cn",
  ".edu.sg",
  ".edu.hk",
  ".edu.my",
  ".edu.in",
  ".edu.br",
  ".edu.mx",
  ".uni-heidelberg.de",
];

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) return null;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain.includes(".") ? domain : null;
}

/** True when an address *looks* academic. Necessary, never sufficient. */
export function looksAcademic(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  return ACADEMIC_SUFFIXES.some(suffix => domain.endsWith(suffix));
}

export interface PostingRights {
  canPost: boolean;
  reason?: string;
}

export interface ViewerVerification {
  emailVerified: boolean;
  /** Community ids where this viewer holds a verified student credential. */
  verifiedStudentCommunityIds: string[];
  suspended: boolean;
}

/**
 * The single posting rule, in one place: universal needs a confirmed email,
 * students additionally needs a verified credential for *that* university.
 */
export function canPostIn(
  mode: MarketplaceMode,
  viewer: ViewerVerification | null,
  communityId?: string
): PostingRights {
  if (!viewer) {
    return { canPost: false, reason: "Sign in to post a listing." };
  }
  if (viewer.suspended) {
    return { canPost: false, reason: "This account is suspended." };
  }
  if (!viewer.emailVerified) {
    return {
      canPost: false,
      reason: "Confirm your email address before posting.",
    };
  }

  if (MODES[mode].requiresStudentVerification) {
    if (!communityId) {
      return { canPost: false, reason: "Choose your university first." };
    }
    if (!viewer.verifiedStudentCommunityIds.includes(communityId)) {
      return {
        canPost: false,
        reason:
          "Posting here needs a verified student email from this university.",
      };
    }
  }

  return { canPost: true };
}
