import { NextResponse } from "next/server";

import { getListing } from "@/lib/data/store";

export const dynamic = "force-dynamic";

/** GET /api/listings/:id */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listing = await getListing(id);

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  return NextResponse.json({ listing });
}
