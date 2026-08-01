"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SORT_OPTIONS, type SortKey } from "@/lib/constants";
import { buildHref, type ListingQuery } from "@/lib/listings/query";

export function SortSelect({ query }: { query: ListingQuery }) {
  const router = useRouter();

  // Radix resolves the selected item's text only after mount, so the label is
  // passed explicitly to keep the trigger filled during server rendering.
  const activeLabel =
    SORT_OPTIONS.find(option => option.value === query.sort)?.label ?? "";

  return (
    <Select
      value={query.sort}
      onValueChange={value =>
        router.push(
          buildHref("/browse", { ...query, sort: value as SortKey, page: 1 }),
          { scroll: false }
        )
      }
    >
      <SelectTrigger className="w-[180px]" aria-label="Sort listings">
        <SelectValue>{activeLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map(option => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
