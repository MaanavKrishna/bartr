import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buildHref, type ListingQuery } from "@/lib/listings/query";
import { cn } from "@/lib/utils";

interface PaginationProps {
  query: ListingQuery;
  page: number;
  totalPages: number;
}

/** Page numbers around the current page, with ellipses for the gaps. */
function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, page]);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < totalPages) pages.add(page + 1);

  const ordered = [...pages].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    if (index > 0 && ordered[index] - ordered[index - 1] > 1)
      result.push("gap");
    result.push(ordered[index]);
  }
  return result;
}

export function Pagination({ query, page, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null;

  const href = (target: number) =>
    buildHref("/browse", { ...query, page: target });

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-1 pt-8"
    >
      <PageLink
        href={href(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </PageLink>

      {pageWindow(page, totalPages).map((entry, index) =>
        entry === "gap" ? (
          <span
            key={`gap-${index}`}
            className="px-2 text-sm text-muted-foreground"
          >
            …
          </span>
        ) : (
          <PageLink key={entry} href={href(entry)} active={entry === page}>
            {entry}
          </PageLink>
        )
      )}

      <PageLink
        href={href(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  active,
  disabled,
  children,
  ...props
}: {
  href: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
} & React.ComponentProps<"a">) {
  const className = cn(
    "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm transition-colors",
    active
      ? "border-primary bg-primary font-semibold text-primary-foreground"
      : "hover:bg-muted",
    disabled && "pointer-events-none opacity-40"
  );

  if (disabled) {
    return (
      <span className={className} aria-disabled {...props}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={className}
      aria-current={active ? "page" : undefined}
      {...props}
    >
      {children}
    </Link>
  );
}
