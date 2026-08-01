import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Eye, MapPin, Star } from "lucide-react";

import { ListingGrid } from "@/components/listing-card";
import { MakeOfferDialog } from "@/components/make-offer-dialog";
import { SaveButton } from "@/components/save-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CATEGORY_META, CONDITION_META, KIND_META } from "@/lib/constants";
import {
  getListing,
  listOffersForListing,
  listRelatedListings,
  recordListingView,
} from "@/lib/data/store";
import {
  formatCents,
  formatListingPrice,
  formatRelativeTime,
  gradientFor,
  initials,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) return { title: "Listing not found" };

  return {
    title: listing.title,
    description: listing.description.slice(0, 160),
    openGraph: {
      title: listing.title,
      description: listing.description.slice(0, 160),
    },
  };
}

export default async function ListingPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();

  await recordListingView(listing.id);
  const [offers, related] = await Promise.all([
    listOffersForListing(listing.id),
    listRelatedListings(listing),
  ]);

  const category = CATEGORY_META[listing.category];

  return (
    <div className="container py-8">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
        <Link href="/browse">
          <ArrowLeft className="h-4 w-4" />
          Back to browse
        </Link>
      </Button>

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <div
            className={cn(
              "grid h-72 place-items-center rounded-2xl bg-gradient-to-br sm:h-96",
              gradientFor(listing.id)
            )}
          >
            <span aria-hidden className="text-8xl opacity-80">
              {category.emoji}
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{KIND_META[listing.kind].label}</Badge>
              <Badge variant="secondary">{category.label}</Badge>
              <Badge variant="outline">
                {CONDITION_META[listing.condition].label}
              </Badge>
              {listing.status === "pending" && (
                <Badge variant="muted">Offer pending</Badge>
              )}
            </div>

            <h1 className="text-3xl font-bold tracking-tight">
              {listing.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {listing.campus} · {listing.meetupSpot}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {listing.views} views
              </span>
              <span>Posted {formatRelativeTime(listing.createdAt)}</span>
            </div>

            <Separator />

            <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
              {listing.description}
            </p>

            {listing.wants.length > 0 && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
                <h2 className="text-sm font-semibold">Looking to trade for</h2>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {listing.wants.map(want => (
                    <li key={want}>
                      <Badge variant="outline">{want}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {listing.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {listing.tags.map(tag => (
                  <Link
                    key={tag}
                    href={`/browse?q=${encodeURIComponent(tag)}`}
                    className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <section>
            <h2 className="mb-3 text-lg font-semibold">
              Offers ({offers.length})
            </h2>
            {offers.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No offers yet. Be the first.
              </p>
            ) : (
              <ul className="space-y-3">
                {offers.map(offer => (
                  <li
                    key={offer.id}
                    className="rounded-lg border bg-card p-4 text-card-foreground"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {initials(offer.from?.name ?? "?")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                          <p className="font-medium">
                            {offer.from?.name ?? "Someone"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeTime(offer.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-primary">
                          {offer.kind === "cash" && offer.amountCents !== null
                            ? formatCents(offer.amountCents)
                            : (offer.offeredItem ?? "Trade")}
                        </span>
                        {offer.status !== "pending" && (
                          <Badge
                            variant={
                              offer.status === "accepted" ? "default" : "muted"
                            }
                          >
                            {offer.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {offer.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:h-fit">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-3xl text-primary">
                {formatListingPrice(listing)}
              </CardTitle>
              {listing.kind === "barter" && (
                <p className="text-sm text-muted-foreground">
                  Trade only — no cash accepted.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <MakeOfferDialog
                  listingId={listing.id}
                  listingTitle={listing.title}
                  listingKind={listing.kind}
                />
                <SaveButton
                  listingId={listing.id}
                  title={listing.title}
                  variant="full"
                  className="h-10"
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Meet at {listing.meetupSpot}. Bartr never handles payment.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Seller</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>
                    {initials(listing.seller.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-semibold">
                    {listing.seller.name}
                    {listing.seller.verified && (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{listing.seller.handle} · {listing.seller.campus}
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {listing.seller.bio}
              </p>

              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-accent text-accent" />
                  <span className="font-semibold">{listing.seller.rating}</span>
                </span>
                <span className="text-muted-foreground">
                  {listing.seller.tradesCompleted} trades completed
                </span>
              </div>

              <Button asChild variant="outline" size="sm" className="w-full">
                <Link
                  href={`/browse?campus=${encodeURIComponent(listing.campus)}`}
                >
                  More from {listing.campus}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">
            You might also like
          </h2>
          <ListingGrid listings={related} />
        </section>
      )}
    </div>
  );
}
