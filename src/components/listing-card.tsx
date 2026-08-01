import Link from "next/link";
import { Eye, MapPin } from "lucide-react";

import { SaveButton } from "@/components/save-button";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_META, CONDITION_META, KIND_META } from "@/lib/constants";
import {
  formatListingPrice,
  formatRelativeTime,
  gradientFor,
} from "@/lib/format";
import type { ListingWithSeller } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_BADGE_VARIANT = {
  sale: "secondary",
  barter: "accent",
  free: "default",
} as const;

export function ListingCard({ listing }: { listing: ListingWithSeller }) {
  const category = CATEGORY_META[listing.category];

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div
        className={cn(
          "relative grid h-40 place-items-center bg-gradient-to-br",
          gradientFor(listing.id)
        )}
      >
        <span aria-hidden className="text-5xl opacity-80">
          {category.emoji}
        </span>

        <div className="absolute left-3 top-3 flex gap-1.5">
          <Badge variant={KIND_BADGE_VARIANT[listing.kind]}>
            {KIND_META[listing.kind].label}
          </Badge>
          {listing.status === "pending" && (
            <Badge variant="muted">Pending</Badge>
          )}
        </div>

        {/* z-10 lifts the button above the stretched link's ::after overlay,
            which would otherwise swallow the click. */}
        <SaveButton
          listingId={listing.id}
          title={listing.title}
          className="absolute right-3 top-3 z-10"
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="line-clamp-2 font-semibold leading-snug">
            {/* Stretched link keeps the whole card clickable without nesting
                interactive elements inside an anchor. */}
            <Link
              href={`/listings/${listing.id}`}
              className="after:absolute after:inset-0"
            >
              {listing.title}
            </Link>
          </h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {listing.description}
          </p>
        </div>

        <div className="mt-auto space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold text-primary">
              {formatListingPrice(listing)}
            </span>
            <span className="text-xs text-muted-foreground">
              {CONDITION_META[listing.condition].label}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{listing.campus}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {listing.views}
              </span>
              <span>{formatRelativeTime(listing.createdAt)}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ListingGrid({ listings }: { listings: ListingWithSeller[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map(listing => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
