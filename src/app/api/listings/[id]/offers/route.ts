import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  createOffer,
  getListing,
  listOffersForListing,
} from "@/lib/data/store";
import { createOfferSchema, fieldErrors } from "@/lib/validation";
import { Logger } from "@/utils/logger";

const logger = new Logger("API:Offers");

export const dynamic = "force-dynamic";

/** GET /api/listings/:id/offers */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  return NextResponse.json({ offers: await listOffersForListing(id) });
}

/** POST /api/listings/:id/offers — make a cash or trade offer. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const listing = await getListing(id);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.status === "closed") {
    return NextResponse.json(
      { error: "This listing is closed to new offers" },
      { status: 409 }
    );
  }

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
    const input = createOfferSchema.parse(body);
    const offer = await createOffer({ ...input, listingId: id });
    return NextResponse.json({ offer }, { status: 201 });
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
    logger.error("Failed to create offer", error);
    return NextResponse.json(
      { error: "Something went wrong sending that offer" },
      { status: 500 }
    );
  }
}
