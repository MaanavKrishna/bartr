import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { ListingFilters } from "@/components/listing-filters";
import { ListingGrid } from "@/components/listing-card";
import { SortSelect } from "@/components/listing-toolbar";
import { Pagination } from "@/components/pagination";
import { getAllListings, searchListings } from "@/lib/data/store";
import {
  countActiveFilters,
  filterListings,
  parseListingQuery,
  type RawSearchParams,
} from "@/lib/listings/query";
import { pluralize } from "@/lib/format";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse",
  description: "Every listing on Bartr — filter by campus, category and price.",
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseListingQuery(await searchParams);
  const results = await searchListings(query);

  // Counts shown next to each category reflect the rest of the filters but
  // ignore the category filter itself, so the list does not collapse to one row
  // the moment you pick something.
  const all = await getAllListings();
  const withoutCategory = filterListings(all, { ...query, categories: [] });
  const categoryCounts = withoutCategory.reduce<
    Partial<Record<Category, number>>
  >((counts, listing) => {
    counts[listing.category] = (counts[listing.category] ?? 0) + 1;
    return counts;
  }, {});

  const activeFilters = countActiveFilters(query);

  return (
    <div className="container py-10">
      <div className="mb-8 space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          {query.q ? `Results for “${query.q}”` : "Browse the marketplace"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {pluralize(results.total, "listing")} matched
          {results.totalPages > 1 &&
            ` · page ${results.page} of ${results.totalPages}`}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          {/* Collapsed by default on small screens so results are the first
              thing you see. */}
          <details className="mb-2 rounded-lg border lg:hidden">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Filters
              {activeFilters > 0 && (
                <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {activeFilters}
                </span>
              )}
            </summary>
            <div className="border-t p-4">
              <ListingFilters
                query={query}
                categoryCounts={categoryCounts}
                showHeading={false}
              />
            </div>
          </details>
          <div className="hidden lg:block">
            <ListingFilters query={query} categoryCounts={categoryCounts} />
          </div>
        </aside>

        <div>
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Showing {results.items.length} of {results.total}
            </p>
            <SortSelect query={query} />
          </div>

          {results.items.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              description="Try widening the price range, clearing a category, or searching for something more general."
              action={{ href: "/browse", label: "Clear all filters" }}
            />
          ) : (
            <>
              <ListingGrid listings={results.items} />
              <Pagination
                query={query}
                page={results.page}
                totalPages={results.totalPages}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
