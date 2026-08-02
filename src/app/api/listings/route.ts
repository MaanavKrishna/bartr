import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  createListing,
  getCurrentUser,
  getListing,
  searchListings,
} from "@/lib/data/store";
import { parseListingQuery } from "@/lib/listings/query";
import { createListingSchema, fieldErrors } from "@/lib/validation";
import { Logger } from "@/utils/logger";

const logger = new Logger("API:Listings");

export const dynamic = "force-dynamic";

/**
 * GET /api/listings
 *   ?ids=a,b,c  → hydrate specific listings (used by the saved-items page)
 *   otherwise   → the same filter/sort/paginate pipeline the browse page uses
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  const ids = url.searchParams.get("ids");
  if (ids !== null) {
    const wanted = ids
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
      .slice(0, 100);

    const found = await Promise.all(wanted.map(id => getListing(id)));
    return NextResponse.json({
      listings: found.filter(listing => listing !== null),
    });
  }

  const query = parseListingQuery(Object.fromEntries(url.searchParams));
  const page = await searchListings(query);
  return NextResponse.json(page);
}

/** POST /api/listings — publish a new listing. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  // Publishing is not something an anonymous caller can do. Checking here
  // turns what would surface as a 500 from the data layer into the 401 it
  // actually is.
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json(
      { error: "Sign in to publish a listing." },
      { status: 401 }
    );
  }

  try {
    const input = createListingSchema.parse(body);
    const listing = await createListing({ ...input, sellerId: viewer.id });
    return NextResponse.json({ listing }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Some fields need attention",
          fieldErrors: fieldErrors(error),
        },
        { status: 422 }
      );
    }
    logger.error("Failed to create listing", error);
    return NextResponse.json(
      { error: "Something went wrong publishing that listing" },
      { status: 500 }
    );
  }
}
