"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CAMPUSES,
  CATEGORY_META,
  CONDITION_META,
  KIND_META,
} from "@/lib/constants";
import {
  buildHref,
  countActiveFilters,
  EMPTY_QUERY,
  type ListingQuery,
} from "@/lib/listings/query";
import { CATEGORIES, CONDITIONS, LISTING_KINDS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ListingFiltersProps {
  query: ListingQuery;
  /** Result counts per category for the current search, if available. */
  categoryCounts?: Partial<Record<string, number>>;
  /**
   * False when the panel sits inside a disclosure that already says "Filters",
   * so the label is not printed twice.
   */
  showHeading?: boolean;
}

export function ListingFilters({
  query,
  categoryCounts,
  showHeading = true,
}: ListingFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [minInput, setMinInput] = React.useState(
    query.minCents === null ? "" : String(query.minCents / 100)
  );
  const [maxInput, setMaxInput] = React.useState(
    query.maxCents === null ? "" : String(query.maxCents / 100)
  );

  React.useEffect(() => {
    setMinInput(query.minCents === null ? "" : String(query.minCents / 100));
    setMaxInput(query.maxCents === null ? "" : String(query.maxCents / 100));
  }, [query.minCents, query.maxCents]);

  const apply = React.useCallback(
    (patch: Partial<ListingQuery>) => {
      // Any filter change resets pagination — page 4 of the old result set is
      // meaningless against the new one.
      const next = { ...query, ...patch, page: 1 };
      startTransition(() =>
        router.push(buildHref("/browse", next), { scroll: false })
      );
    },
    [query, router]
  );

  function toggleIn<T extends string>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter(entry => entry !== value)
      : [...list, value];
  }

  function applyPriceRange(event: React.FormEvent) {
    event.preventDefault();
    const toCents = (value: string) => {
      const parsed = Number(value.trim());
      if (value.trim() === "" || !Number.isFinite(parsed) || parsed < 0)
        return null;
      return Math.round(parsed * 100);
    };
    apply({ minCents: toCents(minInput), maxCents: toCents(maxInput) });
  }

  const activeCount = countActiveFilters(query);
  const clearAll = () =>
    apply({ ...EMPTY_QUERY, q: query.q, sort: query.sort });

  return (
    <div
      className={cn(
        "space-y-6 transition-opacity",
        pending && "pointer-events-none opacity-60"
      )}
    >
      {showHeading && (
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeCount > 0 && (
              <Badge variant="secondary" className="h-5 px-2 py-0 text-[10px]">
                {activeCount}
              </Badge>
            )}
          </h2>
          {activeCount > 0 && <ClearButton onClick={clearAll} />}
        </div>
      )}

      <FilterSection title="Listing type">
        <div className="flex flex-wrap gap-2">
          {LISTING_KINDS.map(kind => (
            <Pill
              key={kind}
              active={query.kinds.includes(kind)}
              onClick={() => apply({ kinds: toggleIn(query.kinds, kind) })}
            >
              <span aria-hidden>{KIND_META[kind].emoji}</span>
              {KIND_META[kind].label}
            </Pill>
          ))}
        </div>
      </FilterSection>

      <Separator />

      <FilterSection title="Category">
        <div className="space-y-1">
          {CATEGORIES.map(category => {
            const active = query.categories.includes(category);
            const count = categoryCounts?.[category];
            return (
              <button
                key={category}
                type="button"
                onClick={() =>
                  apply({ categories: toggleIn(query.categories, category) })
                }
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  active && "bg-secondary font-medium"
                )}
              >
                <span aria-hidden>{CATEGORY_META[category].emoji}</span>
                <span className="flex-1 truncate">
                  {CATEGORY_META[category].label}
                </span>
                {count !== undefined && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </FilterSection>

      <Separator />

      <FilterSection title="Condition">
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map(condition => (
            <Pill
              key={condition}
              active={query.conditions.includes(condition)}
              onClick={() =>
                apply({ conditions: toggleIn(query.conditions, condition) })
              }
            >
              {CONDITION_META[condition].label}
            </Pill>
          ))}
        </div>
      </FilterSection>

      <Separator />

      <FilterSection title="Campus">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => apply({ campus: null })}
            aria-pressed={query.campus === null}
            className={cn(
              "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
              query.campus === null && "bg-secondary font-medium"
            )}
          >
            All campuses
          </button>
          {CAMPUSES.map(campus => (
            <button
              key={campus}
              type="button"
              onClick={() =>
                apply({ campus: query.campus === campus ? null : campus })
              }
              aria-pressed={query.campus === campus}
              className={cn(
                "w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                query.campus === campus && "bg-secondary font-medium"
              )}
            >
              {campus}
            </button>
          ))}
        </div>
      </FilterSection>

      <Separator />

      <FilterSection title="Price">
        <form onSubmit={applyPriceRange} className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label
                htmlFor="min-price"
                className="text-xs text-muted-foreground"
              >
                Min $
              </Label>
              <Input
                id="min-price"
                inputMode="decimal"
                placeholder="0"
                value={minInput}
                onChange={event => setMinInput(event.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label
                htmlFor="max-price"
                className="text-xs text-muted-foreground"
              >
                Max $
              </Label>
              <Input
                id="max-price"
                inputMode="decimal"
                placeholder="Any"
                value={maxInput}
                onChange={event => setMaxInput(event.target.value)}
              />
            </div>
          </div>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Apply price
          </Button>
          <p className="text-xs text-muted-foreground">
            Barter listings are hidden while a price range is set.
          </p>
        </form>
      </FilterSection>

      {/* With the heading hidden there is nowhere else to reset from. */}
      {!showHeading && activeCount > 0 && (
        <ClearButton onClick={clearAll} className="w-full justify-center" />
      )}
    </div>
  );
}

function ClearButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("h-7 px-2 text-xs text-muted-foreground", className)}
      onClick={onClick}
    >
      <X className="h-3 w-3" />
      Clear all filters
    </Button>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted",
        active &&
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
      )}
    >
      {children}
    </button>
  );
}
