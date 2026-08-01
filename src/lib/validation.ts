import { z } from "zod";

import { CAMPUSES } from "@/lib/constants";
import {
  CATEGORIES,
  CONDITIONS,
  LISTING_KINDS,
  OFFER_KINDS,
} from "@/lib/types";

/**
 * One schema per write operation, shared by the client form and the API route
 * so validation cannot drift between them.
 */

const priceDollars = z
  .string()
  .trim()
  .refine(value => value === "" || Number.isFinite(Number(value)), {
    message: "Enter a number",
  })
  .refine(value => value === "" || Number(value) >= 0, {
    message: "Price cannot be negative",
  })
  .refine(value => value === "" || Number(value) <= 100_000, {
    message: "That is above the $100,000 limit",
  });

export const listingFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(6, "Give it at least 6 characters")
      .max(90, "Keep the title under 90 characters"),
    description: z
      .string()
      .trim()
      .min(20, "Say a little more — at least 20 characters")
      .max(1200, "Keep it under 1200 characters"),
    kind: z.enum(LISTING_KINDS),
    price: priceDollars,
    wants: z
      .string()
      .trim()
      .max(200, "Keep it under 200 characters")
      .optional(),
    category: z.enum(CATEGORIES),
    condition: z.enum(CONDITIONS),
    campus: z.enum(CAMPUSES),
    meetupSpot: z
      .string()
      .trim()
      .min(3, "Where should people meet you?")
      .max(80, "Keep it under 80 characters"),
    tags: z.string().trim().max(120, "Keep it under 120 characters").optional(),
  })
  .superRefine((value, ctx) => {
    // Price is required for sale listings and meaningless for the others.
    if (value.kind === "sale" && value.price.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "Sale listings need a price",
      });
    }
    if (value.kind === "barter" && !value.wants?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["wants"],
        message: "Tell people what you would trade for",
      });
    }
  });

export type ListingFormValues = z.infer<typeof listingFormSchema>;

/** Splits a comma-separated field into a clean, de-duplicated list. */
export function splitList(value: string | undefined, limit = 8): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  for (const entry of value.split(",")) {
    const trimmed = entry.trim();
    if (trimmed) seen.add(trimmed);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

/** The wire format the create-listing API accepts. */
export const createListingSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(6, "Give it at least 6 characters")
      .max(90, "Keep the title under 90 characters"),
    description: z
      .string()
      .trim()
      .min(20, "Say a little more — at least 20 characters")
      .max(1200, "Keep it under 1200 characters"),
    kind: z.enum(LISTING_KINDS, { message: "Pick sale, barter or free" }),
    priceCents: z
      .number()
      .int("Price must be a whole number of cents")
      .min(0, "Price cannot be negative")
      .max(10_000_000, "That is above the $100,000 limit")
      .nullable(),
    wants: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
    category: z.enum(CATEGORIES, { message: "Pick a category" }),
    condition: z.enum(CONDITIONS, { message: "Pick a condition" }),
    campus: z.string().trim().min(2, "Which campus?").max(80),
    meetupSpot: z
      .string()
      .trim()
      .min(3, "Where should people meet you?")
      .max(80, "Keep it under 80 characters"),
    tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "sale" && value.priceCents === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceCents"],
        message: "Sale listings need a price",
      });
    }
  })
  .transform(value => ({
    ...value,
    // Only sale listings carry a price, whatever the client sent.
    priceCents: value.kind === "sale" ? value.priceCents : null,
    wants: value.kind === "barter" ? value.wants : [],
  }));

export type CreateListingInput = z.infer<typeof createListingSchema>;

export const createOfferSchema = z
  .object({
    kind: z.enum(OFFER_KINDS),
    amountCents: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .nullable()
      .default(null),
    offeredItem: z.string().trim().min(2).max(120).nullable().default(null),
    message: z
      .string()
      .trim()
      .min(5, "Add a short note")
      .max(600, "Keep it under 600 characters"),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "cash" && value.amountCents === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountCents"],
        message: "How much are you offering?",
      });
    }
    if (value.kind === "trade" && !value.offeredItem) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["offeredItem"],
        message: "What are you offering in trade?",
      });
    }
  });

export type CreateOfferInput = z.infer<typeof createOfferSchema>;

/** Converts a dollar string from a form into integer cents. */
export function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

/** Flattens a ZodError into `{ field: message }` for form and API responses. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path.join(".") || "form";
    result[key] ??= issue.message;
  }
  return result;
}
