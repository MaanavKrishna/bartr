import Link from "next/link";

import { BartrMark } from "@/components/bartr-mark";
import { CATEGORY_META } from "@/lib/constants";
import { CATEGORIES } from "@/lib/types";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t bg-muted/30">
      <div className="container grid gap-10 py-12 md:grid-cols-[2fr_1fr_1fr]">
        <div className="max-w-sm space-y-3">
          <div className="flex items-center gap-2">
            <BartrMark className="h-7 w-7 rounded-md" />
            <span className="font-bold tracking-tight">Bartr</span>
          </div>
          <p className="text-sm text-muted-foreground">
            The storefront layer for campus barter and resale. Every campus runs
            its own market; Bartr gives it a shape.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Categories</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {CATEGORIES.slice(0, 5).map(category => (
              <li key={category}>
                <Link
                  href={`/browse?category=${category}`}
                  className="transition-colors hover:text-foreground"
                >
                  {CATEGORY_META[category].label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Marketplace</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <Link
                href="/browse"
                className="transition-colors hover:text-foreground"
              >
                Browse everything
              </Link>
            </li>
            <li>
              <Link
                href="/sell"
                className="transition-colors hover:text-foreground"
              >
                List an item
              </Link>
            </li>
            <li>
              <Link
                href="/saved"
                className="transition-colors hover:text-foreground"
              >
                Saved items
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                className="transition-colors hover:text-foreground"
              >
                Seller dashboard
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t">
        <div className="container flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Demo build — listings are seeded sample data.</p>
          <p>Built with Next.js, Tailwind CSS and shadcn/ui.</p>
        </div>
      </div>
    </footer>
  );
}
