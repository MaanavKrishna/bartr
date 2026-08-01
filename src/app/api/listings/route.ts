import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createListing, getListing, searchListings } from "@/lib/data/store";
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

  try {
    const input = createListingSchema.parse(body);
    const listing = await createListing(input);
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
