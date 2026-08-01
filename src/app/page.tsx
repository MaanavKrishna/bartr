import Link from "next/link";
import { ArrowRight, Recycle, ShieldCheck, Zap } from "lucide-react";

import { ListingGrid } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { CATEGORY_META } from "@/lib/constants";
import { searchListings } from "@/lib/data/store";
import { EMPTY_QUERY } from "@/lib/listings/query";
import { CATEGORIES } from "@/lib/types";

// Listings live in a mutable in-memory store, so this page is rendered per
// request rather than baked at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [fresh, popular] = await Promise.all([
    searchListings({ ...EMPTY_QUERY, perPage: 6, sort: "newest" }),
    searchListings({ ...EMPTY_QUERY, perPage: 3, sort: "popular" }),
  ]);

  return (
    <>
      <section className="border-b bg-gradient-to-b from-primary/10 via-background to-background">
        <div className="container flex flex-col items-center gap-6 py-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <Zap className="h-3 w-3 text-accent" />
            {fresh.total} live listings across 5 campuses
          </span>

          <h1 className="max-w-3xl text-balance text-4xl font-black tracking-tight sm:text-6xl">
            Your campus already trades.{" "}
            <span className="text-primary">Give it a storefront.</span>
          </h1>

          <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
            Bartr is the marketplace layer for campus barter and resale. Sell
            it, swap it, or give it away — to people who live ten minutes from
            you.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/browse">
                Browse the marketplace
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sell">List something</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container py-14">
        <h2 className="mb-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Browse by category
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map(category => (
            <Link
              key={category}
              href={`/browse?category=${category}`}
              className="rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
            >
              <span aria-hidden className="text-2xl">
                {CATEGORY_META[category].emoji}
              </span>
              <p className="mt-2 font-semibold">
                {CATEGORY_META[category].label}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {CATEGORY_META[category].blurb}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="container pb-14">
        <SectionHeading
          title="Just listed"
          subtitle="The newest items posted across every campus."
          href="/browse?sort=newest"
        />
        <ListingGrid listings={fresh.items} />
      </section>

      <section className="border-y bg-muted/30 py-14">
        <div className="container grid gap-8 md:grid-cols-3">
          <Feature
            Icon={Recycle}
            title="Trade, not just sell"
            body="Barter listings are first class. Say what you want in return and let people offer swaps instead of cash."
          />
          <Feature
            Icon={ShieldCheck}
            title="Campus-scoped"
            body="Every listing carries a campus and a meetup spot, so a handoff is a walk across the quad, not a shipping label."
          />
          <Feature
            Icon={Zap}
            title="Zero friction"
            body="Post an item in under a minute. No storefront setup, no fees, no waiting for approval."
          />
        </div>
      </section>

      <section className="container py-14">
        <SectionHeading
          title="Most viewed"
          subtitle="What everyone is circling this week."
          href="/browse?sort=popular"
        />
        <ListingGrid listings={popular.items} />
      </section>
    </>
  );
}

function SectionHeading({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle: string;
  href: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <Button asChild variant="ghost" size="sm">
        <Link href={href}>
          See all
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function Feature({
  Icon,
  title,
  body,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="space-y-2">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
