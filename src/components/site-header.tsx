"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Heart, LayoutDashboard, Plus, Search, Store } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { useSavedListings } from "@/components/saved-listings-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/browse", label: "Browse", Icon: Store },
  { href: "/saved", label: "Saved", Icon: Heart },
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { savedIds, hydrated } = useSavedListings();

  const [term, setTerm] = React.useState(searchParams.get("q") ?? "");

  // Keep the field in step with the URL when navigation changes `q`.
  React.useEffect(() => {
    setTerm(searchParams.get("q") ?? "");
  }, [searchParams]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = term.trim();
    router.push(
      trimmed ? `/browse?q=${encodeURIComponent(trimmed)}` : "/browse"
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {/* On narrow screens the search field drops to its own row rather than
          being squeezed between the logo and the nav. */}
      <div className="container flex flex-wrap items-center gap-3 py-3 sm:h-16 sm:flex-nowrap sm:py-0">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
            B
          </span>
          <span className="text-lg font-bold tracking-tight">Bartr</span>
        </Link>

        <form
          onSubmit={onSubmit}
          className="relative order-last w-full sm:order-none sm:w-auto sm:max-w-xl sm:flex-1"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={event => setTerm(event.target.value)}
            placeholder="Search textbooks, bikes, fridges…"
            aria-label="Search listings"
            className="h-9 pl-9"
          />
        </form>

        <nav className="ml-auto flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Button
                key={href}
                asChild
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className={cn("relative", !active && "text-muted-foreground")}
              >
                <Link href={href}>
                  <Icon className="h-4 w-4" />
                  <span className="hidden lg:inline">{label}</span>
                  {href === "/saved" && hydrated && savedIds.length > 0 && (
                    <Badge
                      variant="accent"
                      className="ml-1 h-5 px-1.5 py-0 text-[10px]"
                    >
                      {savedIds.length}
                    </Badge>
                  )}
                </Link>
              </Button>
            );
          })}

          <Button asChild size="sm" className="ml-1">
            <Link href="/sell">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">List an item</span>
            </Link>
          </Button>

          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
