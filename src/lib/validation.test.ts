import { describe, expect, it } from "vitest";

import {
  createListingSchema,
  createOfferSchema,
  dollarsToCents,
  fieldErrors,
  listingFormSchema,
  splitList,
} from "@/lib/validation";

const validListing = {
  title: "Steel road bike, 54cm",
  description: "Freshly tuned, new bar tape, rides beautifully on River Road.",
  kind: "sale" as const,
  priceCents: 22000,
  wants: [],
  category: "bikes" as const,
  condition: "good" as const,
  campus: "Dartmouth College",
  meetupSpot: "Collis Center porch",
  tags: ["bike"],
};

describe("dollarsToCents", () => {
  it("converts and rounds", () => {
    expect(dollarsToCents("45")).toBe(4500);
    expect(dollarsToCents("45.994")).toBe(4599);
  });

  it("returns null for blank or invalid input", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("  ")).toBeNull();
    expect(dollarsToCents("free")).toBeNull();
    expect(dollarsToCents("-10")).toBeNull();
  });
});

describe("splitList", () => {
  it("trims, drops blanks and de-duplicates", () => {
    expect(splitList("bike, , commuter,bike ")).toEqual(["bike", "commuter"]);
  });

  it("returns an empty list for undefined", () => {
    expect(splitList(undefined)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(splitList("a,b,c,d", 2)).toEqual(["a", "b"]);
  });
});

describe("createListingSchema", () => {
  it("accepts a well-formed sale listing", () => {
    expect(createListingSchema.parse(validListing).priceCents).toBe(22000);
  });

  it("rejects a sale listing with no price", () => {
    const result = createListingSchema.safeParse({
      ...validListing,
      priceCents: null,
    });
    expect(result.success).toBe(false);
  });

  it("strips the price off non-sale listings", () => {
    const parsed = createListingSchema.parse({
      ...validListing,
      kind: "free",
      priceCents: 5000,
    });
    expect(parsed.priceCents).toBeNull();
  });

  it("keeps wants only on barter listings", () => {
    expect(
      createListingSchema.parse({ ...validListing, wants: ["Office chair"] })
        .wants
    ).toEqual([]);
    expect(
      createListingSchema.parse({
        ...validListing,
        kind: "barter",
        priceCents: null,
        wants: ["Office chair"],
      }).wants
    ).toEqual(["Office chair"]);
  });

  it("rejects a too-short title or description", () => {
    expect(
      createListingSchema.safeParse({ ...validListing, title: "Bike" }).success
    ).toBe(false);
    expect(
      createListingSchema.safeParse({ ...validListing, description: "Nice" })
        .success
    ).toBe(false);
  });

  it("rejects an unknown category", () => {
    expect(
      createListingSchema.safeParse({ ...validListing, category: "spaceships" })
        .success
    ).toBe(false);
  });

  it("rejects a negative price", () => {
    expect(
      createListingSchema.safeParse({ ...validListing, priceCents: -1 }).success
    ).toBe(false);
  });
});

describe("listingFormSchema", () => {
  const validForm = {
    title: "Steel road bike, 54cm",
    description:
      "Freshly tuned, new bar tape, rides beautifully on River Road.",
    kind: "sale" as const,
    price: "220",
    wants: "",
    category: "bikes" as const,
    condition: "good" as const,
    campus: "Dartmouth College" as const,
    meetupSpot: "Collis Center porch",
    tags: "bike, commuter",
  };

  it("accepts a valid form", () => {
    expect(listingFormSchema.safeParse(validForm).success).toBe(true);
  });

  it("requires a price on sale listings", () => {
    const result = listingFormSchema.safeParse({ ...validForm, price: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).price).toBe(
        "Sale listings need a price"
      );
    }
  });

  it("does not require a price on free listings", () => {
    expect(
      listingFormSchema.safeParse({ ...validForm, kind: "free", price: "" })
        .success
    ).toBe(true);
  });

  it("requires wants on barter listings", () => {
    const result = listingFormSchema.safeParse({
      ...validForm,
      kind: "barter",
      price: "",
      wants: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).wants).toBeDefined();
    }
  });

  it("rejects a non-numeric price", () => {
    expect(
      listingFormSchema.safeParse({ ...validForm, price: "free" }).success
    ).toBe(false);
  });
});

describe("createOfferSchema", () => {
  it("requires an amount on cash offers", () => {
    expect(
      createOfferSchema.safeParse({
        kind: "cash",
        amountCents: null,
        offeredItem: null,
        message: "Would you take 190?",
      }).success
    ).toBe(false);
  });

  it("requires an item on trade offers", () => {
    expect(
      createOfferSchema.safeParse({
        kind: "trade",
        amountCents: null,
        offeredItem: null,
        message: "Interested in a swap?",
      }).success
    ).toBe(false);
  });

  it("accepts a complete cash offer", () => {
    expect(
      createOfferSchema.safeParse({
        kind: "cash",
        amountCents: 19000,
        offeredItem: null,
        message: "Would you take 190? I can meet today.",
      }).success
    ).toBe(true);
  });

  it("rejects an empty message", () => {
    expect(
      createOfferSchema.safeParse({
        kind: "cash",
        amountCents: 19000,
        offeredItem: null,
        message: "",
      }).success
    ).toBe(false);
  });
});

describe("fieldErrors", () => {
  it("keys messages by field path and keeps the first per field", () => {
    const result = listingFormSchema.safeParse({
      title: "no",
      description: "short",
      kind: "sale",
      price: "",
      category: "bikes",
      condition: "good",
      campus: "Dartmouth College",
      meetupSpot: "x",
      tags: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.title).toBeDefined();
      expect(errors.description).toBeDefined();
      expect(errors.meetupSpot).toBeDefined();
    }
  });
});
