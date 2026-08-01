"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ListingGrid } from "@/components/listing-card";
import { useSavedListings } from "@/components/saved-listings-provider";
import { Button } from "@/components/ui/button";
import { pluralize } from "@/lib/format";
import type { ListingWithSeller } from "@/lib/types";

/**
 * Saves live in the browser, so this page resolves ids client-side and asks the
 * API to hydrate them into full listings.
 */
export default function SavedPage() {
  const { savedIds, hydrated, clear } = useSavedListings();
  const [listings, setListings] = React.useState<ListingWithSeller[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!hydrated) return;

    if (savedIds.length === 0) {
      setListings([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/listings?ids=${savedIds.join(",")}`, {
      signal: controller.signal,
    })
      .then(response => (response.ok ? response.json() : { listings: [] }))
      .then((payload: { listings: ListingWithSeller[] }) => {
        // Preserve the order saves were made in.
        const byId = new Map(payload.listings.map(item => [item.id, item]));
        setListings(
          savedIds
            .map(id => byId.get(id))
            .filter((item): item is ListingWithSeller => Boolean(item))
        );
      })
      .catch(() => {
        // Abort on unmount is expected; anything else falls back to empty.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [savedIds, hydrated]);

  if (!hydrated || loading) {
    return (
      <div className="container flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Saved items</h1>
          <p className="text-sm text-muted-foreground">
            {pluralize(listings.length, "listing")} saved on this device.
          </p>
        </div>
        {listings.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <Trash2 className="h-4 w-4" />
            Clear all
          </Button>
        )}
      </div>

      {listings.length === 0 ? (
        <EmptyState
          emoji="🤍"
          title="Nothing saved yet"
          description="Tap the heart on any listing to keep it here. Saves are stored in this browser."
          action={{ href: "/browse", label: "Browse listings" }}
        />
      ) : (
        <ListingGrid listings={listings} />
      )}
    </div>
  );
}
