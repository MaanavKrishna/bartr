import { describe, expect, it } from "vitest";

import {
  buildHref,
  buildSearchParams,
  countActiveFilters,
  EMPTY_QUERY,
  filterListings,
  paginate,
  parseListingQuery,
  runListingQuery,
  searchScore,
  sortListings,
  type ListingQuery,
} from "@/lib/listings/query";
import type { Listing } from "@/lib/types";

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "l_1",
    title: "Organic Chemistry textbook",
    description: "Barely used, no highlighting.",
    kind: "sale",
    priceCents: 4500,
    wants: [],
    category: "textbooks",
    condition: "like-new",
    campus: "UC Berkeley",
    meetupSpot: "Moffitt Library",
    tags: ["chem", "science"],
    sellerId: "u_1",
    status: "active",
    views: 10,
    createdAt: "2026-01-10T00:00:00.000Z",
    ...overrides,
  };
}

const query = (overrides: Partial<ListingQuery> = {}): ListingQuery => ({
  ...EMPTY_QUERY,
  ...overrides,
});

describe("parseListingQuery", () => {
  it("returns defaults for empty params", () => {
    expect(parseListingQuery({})).toEqual(EMPTY_QUERY);
  });

  it("accepts both repeated and comma-separated list params", () => {
    expect(
      parseListingQuery({ category: "textbooks,bikes" }).categories
    ).toEqual(["textbooks", "bikes"]);
    expect(
      parseListingQuery({ category: ["textbooks", "bikes"] }).categories
    ).toEqual(["textbooks", "bikes"]);
  });

  it("drops unknown enum values instead of failing", () => {
    const parsed = parseListingQuery({
      category: "textbooks,teleportation",
      condition: "brand-spanking-new",
      kind: "sale,auction",
    });
    expect(parsed.categories).toEqual(["textbooks"]);
    expect(parsed.conditions).toEqual([]);
    expect(parsed.kinds).toEqual(["sale"]);
  });

  it("de-duplicates repeated values", () => {
    expect(
      parseListingQuery({ category: "bikes,bikes,bikes" }).categories
    ).toEqual(["bikes"]);
  });

  it("converts price params from dollars to cents", () => {
    const parsed = parseListingQuery({ min: "10", max: "99.99" });
    expect(parsed.minCents).toBe(1000);
    expect(parsed.maxCents).toBe(9999);
  });

  it("ignores non-numeric and negative prices", () => {
    const parsed = parseListingQuery({ min: "cheap", max: "-5" });
    expect(parsed.minCents).toBeNull();
    expect(parsed.maxCents).toBeNull();
  });

  it("swaps an inverted price range rather than matching nothing", () => {
    const parsed = parseListingQuery({ min: "200", max: "50" });
    expect(parsed.minCents).toBe(5000);
    expect(parsed.maxCents).toBe(20000);
  });

  it("falls back to the default sort for unknown keys", () => {
    expect(parseListingQuery({ sort: "vibes" }).sort).toBe("newest");
    expect(parseListingQuery({ sort: "price-asc" }).sort).toBe("price-asc");
  });

  it("clamps page and perPage to sane values", () => {
    expect(parseListingQuery({ page: "0" }).page).toBe(1);
    expect(parseListingQuery({ page: "-3" }).page).toBe(1);
    expect(parseListingQuery({ page: "2.5" }).page).toBe(1);
    expect(parseListingQuery({ perPage: "500" }).perPage).toBe(48);
  });

  it("trims the search term", () => {
    expect(parseListingQuery({ q: "  bike  " }).q).toBe("bike");
  });
});

describe("buildSearchParams", () => {
  it("omits every default", () => {
    expect(buildSearchParams(EMPTY_QUERY).toString()).toBe("");
  });

  it("round-trips through parseListingQuery", () => {
    const original = query({
      q: "road bike",
      categories: ["bikes"],
      conditions: ["good", "fair"],
      kinds: ["sale"],
      campus: "UC Berkeley",
      minCents: 1000,
      maxCents: 50000,
      sort: "price-asc",
      page: 3,
    });

    const params = Object.fromEntries(buildSearchParams(original));
    expect(parseListingQuery(params)).toEqual(original);
  });

  it("builds a bare path when nothing is set", () => {
    expect(buildHref("/browse", EMPTY_QUERY)).toBe("/browse");
    expect(buildHref("/browse", query({ q: "bike" }))).toBe("/browse?q=bike");
  });
});

describe("countActiveFilters", () => {
  it("ignores the search term and sort", () => {
    expect(countActiveFilters(query({ q: "bike", sort: "popular" }))).toBe(0);
  });

  it("counts each selected facet", () => {
    expect(
      countActiveFilters(
        query({
          categories: ["bikes", "dorm"],
          conditions: ["good"],
          campus: "UT Austin",
          minCents: 500,
        })
      )
    ).toBe(5);
  });
});

describe("searchScore", () => {
  it("matches everything when the term is empty", () => {
    expect(searchScore(makeListing(), "")).toBe(1);
  });

  it("ranks a title match above a description match", () => {
    const titled = makeListing({ title: "Mountain bike" });
    const described = makeListing({
      title: "Assorted gear",
      description: "Includes a bike pump",
      tags: [],
    });
    expect(searchScore(titled, "bike")).toBeGreaterThan(
      searchScore(described, "bike")
    );
  });

  it("ranks a title prefix above a mid-title match", () => {
    const prefix = makeListing({ title: "Bike lock" });
    const middle = makeListing({ title: "Road bike lock" });
    expect(searchScore(prefix, "bike")).toBeGreaterThan(
      searchScore(middle, "bike")
    );
  });

  it("is case insensitive", () => {
    expect(searchScore(makeListing(), "ORGANIC")).toBeGreaterThan(0);
  });

  it("requires every word to match somewhere", () => {
    const listing = makeListing({ title: "Organic Chemistry textbook" });
    expect(searchScore(listing, "organic chemistry")).toBeGreaterThan(0);
    expect(searchScore(listing, "organic snowboard")).toBe(0);
  });

  it("matches on tags and on what a barter listing wants", () => {
    expect(searchScore(makeListing(), "science")).toBeGreaterThan(0);
    expect(
      searchScore(makeListing({ wants: ["Lab coat"] }), "lab")
    ).toBeGreaterThan(0);
  });
});

describe("filterListings", () => {
  const listings = [
    makeListing({ id: "a", category: "textbooks", priceCents: 4500 }),
    makeListing({
      id: "b",
      category: "bikes",
      title: "Road bike",
      priceCents: 22000,
      condition: "good",
      campus: "Dartmouth College",
      tags: [],
    }),
    makeListing({
      id: "c",
      kind: "free",
      priceCents: null,
      title: "Mini fridge",
      category: "dorm",
      tags: [],
    }),
    makeListing({
      id: "d",
      kind: "barter",
      priceCents: null,
      title: "Standing desk",
      category: "furniture",
      wants: ["Office chair"],
      tags: [],
    }),
  ];

  it("returns everything for an empty query", () => {
    expect(filterListings(listings, EMPTY_QUERY)).toHaveLength(4);
  });

  it("hides closed listings", () => {
    const withClosed = [
      ...listings,
      makeListing({ id: "e", status: "closed" }),
    ];
    expect(
      filterListings(withClosed, EMPTY_QUERY).map(l => l.id)
    ).not.toContain("e");
  });

  it("treats multiple values within a facet as OR", () => {
    const result = filterListings(
      listings,
      query({ categories: ["bikes", "dorm"] })
    );
    expect(result.map(l => l.id)).toEqual(["b", "c"]);
  });

  it("treats separate facets as AND", () => {
    const result = filterListings(
      listings,
      query({ categories: ["bikes"], campus: "UC Berkeley" })
    );
    expect(result).toHaveLength(0);
  });

  it("applies an inclusive price range", () => {
    expect(
      filterListings(listings, query({ minCents: 4500, maxCents: 4500 })).map(
        l => l.id
      )
    ).toEqual(["a"]);
  });

  it("counts free listings as $0 in a price range", () => {
    expect(
      filterListings(listings, query({ maxCents: 100 })).map(l => l.id)
    ).toEqual(["c"]);
  });

  it("excludes barter listings once a price range is set", () => {
    const result = filterListings(listings, query({ minCents: 0 }));
    expect(result.map(l => l.id)).not.toContain("d");
  });

  it("keeps barter listings when no price range is set", () => {
    expect(
      filterListings(listings, query({ kinds: ["barter"] })).map(l => l.id)
    ).toEqual(["d"]);
  });

  it("combines search with facets", () => {
    const result = filterListings(
      listings,
      query({ q: "bike", categories: ["bikes"] })
    );
    expect(result.map(l => l.id)).toEqual(["b"]);
  });
});

describe("sortListings", () => {
  const cheap = makeListing({
    id: "cheap",
    priceCents: 1000,
    views: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const pricey = makeListing({
    id: "pricey",
    priceCents: 90000,
    views: 500,
    createdAt: "2026-01-05T00:00:00.000Z",
  });
  const barter = makeListing({
    id: "barter",
    kind: "barter",
    priceCents: null,
    views: 50,
    createdAt: "2026-01-09T00:00:00.000Z",
  });
  const listings = [cheap, pricey, barter];

  it("sorts newest first by default", () => {
    expect(sortListings(listings, EMPTY_QUERY).map(l => l.id)).toEqual([
      "barter",
      "pricey",
      "cheap",
    ]);
  });

  it("sorts by price ascending", () => {
    expect(
      sortListings(listings, query({ sort: "price-asc" })).map(l => l.id)
    ).toEqual(["cheap", "pricey", "barter"]);
  });

  it("keeps priceless barter listings last in a high-to-low sort", () => {
    expect(
      sortListings(listings, query({ sort: "price-desc" })).map(l => l.id)
    ).toEqual(["pricey", "cheap", "barter"]);
  });

  it("sorts by views", () => {
    expect(
      sortListings(listings, query({ sort: "popular" })).map(l => l.id)
    ).toEqual(["pricey", "barter", "cheap"]);
  });

  it("lets relevance lead when a search term is present", () => {
    const exact = makeListing({ id: "exact", title: "Snowboard", tags: [] });
    const loose = makeListing({
      id: "loose",
      title: "Winter gear bundle",
      description: "Includes a snowboard",
      tags: [],
    });
    expect(
      sortListings([loose, exact], query({ q: "snowboard" })).map(l => l.id)
    ).toEqual(["exact", "loose"]);
  });

  it("does not mutate its input", () => {
    const input = [pricey, cheap];
    sortListings(input, query({ sort: "price-asc" }));
    expect(input.map(l => l.id)).toEqual(["pricey", "cheap"]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1);

  it("slices the requested page", () => {
    expect(paginate(items, 2, 10).items).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it("reports totals", () => {
    const page = paginate(items, 1, 10);
    expect(page.total).toBe(25);
    expect(page.totalPages).toBe(3);
  });

  it("clamps a page past the end back to the last page", () => {
    expect(paginate(items, 99, 10).page).toBe(3);
  });

  it("reports one page for an empty result set", () => {
    const page = paginate([], 1, 10);
    expect(page.items).toEqual([]);
    expect(page.totalPages).toBe(1);
  });
});

describe("runListingQuery", () => {
  it("filters, sorts and paginates in one pass", () => {
    const listings = [
      makeListing({ id: "a", priceCents: 500, category: "bikes", tags: [] }),
      makeListing({ id: "b", priceCents: 300, category: "bikes", tags: [] }),
      makeListing({ id: "c", priceCents: 100, category: "dorm", tags: [] }),
    ];

    const page = runListingQuery(
      listings,
      query({ categories: ["bikes"], sort: "price-asc", perPage: 1 })
    );

    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.items.map(l => l.id)).toEqual(["b"]);
  });
});
