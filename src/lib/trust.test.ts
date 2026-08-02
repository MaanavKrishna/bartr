import { describe, expect, it } from "vitest";

import {
  assessListing,
  isLikelyDuplicate,
  shouldHoldForReview,
  textSimilarity,
  type ListingDraft,
  type SellerContext,
} from "@/lib/trust";

const honestDraft: ListingDraft = {
  title: "Steel road bike, 54cm",
  description:
    "1980s Univega frame with a modern wheelset, fresh bar tape and new brake pads. I overhauled it myself in the bike co-op last week. Happy to let you test ride it before you decide.",
  kind: "sale",
  priceCents: 22000,
  category: "bikes",
  imageCount: 3,
};

const establishedSeller: SellerContext = {
  emailVerified: true,
  studentVerified: true,
  accountAgeDays: 400,
  completedTrades: 34,
  ratingAvg: 4.9,
  priorListingCount: 12,
};

const newSeller: SellerContext = {
  emailVerified: true,
  studentVerified: false,
  accountAgeDays: 0,
  completedTrades: 0,
  ratingAvg: null,
  priorListingCount: 0,
};

const draft = (overrides: Partial<ListingDraft> = {}): ListingDraft => ({
  ...honestDraft,
  ...overrides,
});

describe("assessListing — honest listings stay clear", () => {
  it("clears a well-formed listing from an established seller", () => {
    const result = assessListing(honestDraft, establishedSeller);
    expect(result.level).toBe("clear");
    expect(shouldHoldForReview(result)).toBe(false);
  });

  it("does not punish a new seller for being new alone", () => {
    const result = assessListing(honestDraft, newSeller);
    expect(shouldHoldForReview(result)).toBe(false);
  });

  it("clears a free listing with no price", () => {
    const result = assessListing(
      draft({ kind: "free", priceCents: null }),
      establishedSeller
    );
    expect(result.level).toBe("clear");
  });
});

describe("assessListing — off-platform contact", () => {
  it("flags an email address in the description", () => {
    const result = assessListing(
      draft({
        description: `${honestDraft.description} Email me at me@gmail.com`,
      }),
      establishedSeller
    );
    expect(result.signals.map(s => s.code)).toContain("contact_email");
  });

  it("flags a phone number", () => {
    const result = assessListing(
      draft({
        description: `${honestDraft.description} Call 555-018-2299 anytime.`,
      }),
      establishedSeller
    );
    expect(result.signals.map(s => s.code)).toContain("contact_phone");
  });

  it("flags a push to another messaging app", () => {
    const result = assessListing(
      draft({
        description: `${honestDraft.description} WhatsApp me for details.`,
      }),
      establishedSeller
    );
    expect(result.signals.map(s => s.code)).toContain("contact_offsite");
  });

  it("does not mistake a normal price or year for a phone number", () => {
    const result = assessListing(honestDraft, establishedSeller);
    expect(result.signals.map(s => s.code)).not.toContain("contact_phone");
  });
});

describe("assessListing — payment fraud", () => {
  it("weights gift cards hardest", () => {
    const result = assessListing(
      draft({
        description: `${honestDraft.description} Payment by Apple gift card only.`,
      }),
      establishedSeller
    );
    expect(result.level).toBe("high");
    expect(shouldHoldForReview(result)).toBe(true);
  });

  it("flags crypto", () => {
    const result = assessListing(
      draft({
        description: `${honestDraft.description} I accept Bitcoin only.`,
      }),
      establishedSeller
    );
    expect(result.signals.map(s => s.code)).toContain("payment_crypto");
  });

  it("flags irreversible rails", () => {
    const result = assessListing(
      draft({
        description: `${honestDraft.description} Send by wire transfer please.`,
      }),
      establishedSeller
    );
    expect(result.signals.map(s => s.code)).toContain("payment_irreversible");
  });

  it("flags an upfront deposit to hold the item", () => {
    const result = assessListing(
      draft({
        description: `${honestDraft.description} Send a deposit up front and I will hold it for you.`,
      }),
      establishedSeller
    );
    expect(result.signals.map(s => s.code)).toContain("payment_upfront_hold");
  });
});

describe("assessListing — the classic scam shape", () => {
  it("scores a textbook scam listing as high risk", () => {
    const scam = assessListing(
      {
        title: "MACBOOK PRO M3 CHEAP MUST GO TODAY",
        description:
          "Leaving the country urgently. Shipping only, cannot meet. Pay by Zelle and message me on WhatsApp.",
        kind: "sale",
        // $5. Category medians are coarse, so the price signal only fires on
        // genuinely absurd numbers — it cannot tell that $50 would also be
        // absurd *for a MacBook* without knowing the item, only the category.
        priceCents: 500,
        category: "electronics",
        imageCount: 0,
      },
      { ...newSeller, emailVerified: false }
    );

    expect(scam.level).toBe("high");
    expect(shouldHoldForReview(scam)).toBe(true);
    const codes = scam.signals.map(s => s.code);
    expect(codes).toContain("no_meetup");
    expect(codes).toContain("urgency");
    expect(codes).toContain("price_implausible");
    expect(codes).toContain("shouting_title");
  });

  it("orders signals by weight so a reviewer reads the worst first", () => {
    const scam = assessListing(
      {
        title: "IPHONE 15 CHEAP",
        description: "Urgent, shipping only, gift card payment, WhatsApp me.",
        kind: "sale",
        priceCents: 3000,
        category: "electronics",
        imageCount: 0,
      },
      newSeller
    );
    const weights = scam.signals.map(s => s.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });
});

describe("assessListing — price plausibility", () => {
  it("flags an implausibly low price", () => {
    const result = assessListing(
      draft({ category: "electronics", priceCents: 500 }),
      establishedSeller
    );
    expect(result.signals.map(s => s.code)).toContain("price_implausible");
  });

  it("accepts a genuine bargain without crying fraud", () => {
    const result = assessListing(
      draft({ category: "textbooks", priceCents: 2000 }),
      establishedSeller
    );
    expect(result.level).toBe("clear");
  });
});

describe("assessListing — earned trust offsets weak signals", () => {
  it("lets a trusted seller post a thin description without review", () => {
    const thin = draft({
      description: "Good bike, works fine.",
      imageCount: 0,
    });
    const trusted = assessListing(thin, establishedSeller);
    const untrusted = assessListing(thin, {
      ...newSeller,
      emailVerified: false,
    });

    expect(trusted.score).toBeLessThan(untrusted.score);
    expect(shouldHoldForReview(trusted)).toBe(false);
  });

  it("never lets credit pull a gift-card listing back under review", () => {
    const result = assessListing(
      draft({ description: "Pay by steam card only, shipping worldwide." }),
      establishedSeller
    );
    expect(shouldHoldForReview(result)).toBe(true);
  });

  it("keeps the score inside 0-100", () => {
    const result = assessListing(honestDraft, establishedSeller);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("warnings", () => {
  it("returns only signals the seller can fix themselves", () => {
    const result = assessListing(
      draft({ imageCount: 0, description: "Short one." }),
      newSeller
    );
    expect(result.warnings.every(signal => signal.actionable)).toBe(true);
    expect(result.warnings.map(s => s.code)).toContain("no_images");
  });
});

describe("textSimilarity", () => {
  it("is 1 for identical text", () => {
    expect(
      textSimilarity(honestDraft.description, honestDraft.description)
    ).toBe(1);
  });

  it("is 0 for unrelated text", () => {
    expect(
      textSimilarity(
        "selling a red mountain bike",
        "chemistry textbook ninth edition"
      )
    ).toBe(0);
  });

  it("catches a repost with the details swapped", () => {
    const a =
      "Brand new sealed laptop for sale must go today message me on whatsapp for fast pickup";
    const b =
      "Brand new sealed tablet for sale must go today message me on whatsapp for fast pickup";
    expect(isLikelyDuplicate(a, b)).toBe(true);
  });

  it("does not call two genuine bike listings duplicates", () => {
    expect(
      isLikelyDuplicate(
        "Steel road bike 54cm freshly tuned with new bar tape and brake pads",
        "Mountain bike full suspension recently serviced great on trails"
      )
    ).toBe(false);
  });

  it("handles empty and very short input", () => {
    expect(textSimilarity("", "")).toBe(0);
    expect(textSimilarity("bike", "bike")).toBe(1);
  });

  it("is symmetric", () => {
    const a = "selling a steel road bike in good condition";
    const b = "steel road bike selling in good condition today";
    expect(textSimilarity(a, b)).toBeCloseTo(textSimilarity(b, a), 10);
  });
});
