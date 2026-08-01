import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Handshake, Package, Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ListingGrid } from "@/components/listing-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getCurrentUser,
  getSellerStats,
  listListingsBySeller,
  listOffersForSeller,
} from "@/lib/data/store";
import { formatCents, formatRelativeTime, initials } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your listings, offers and performance on Bartr.",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [listings, offers, stats] = await Promise.all([
    listListingsBySeller(user.id),
    listOffersForSeller(user.id),
    getSellerStats(user.id),
  ]);

  const pendingOffers = offers.filter(offer => offer.status === "pending");

  return (
    <div className="container py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-base">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
            <p className="text-sm text-muted-foreground">
              @{user.handle} · {user.campus} · {user.tradesCompleted} trades
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/sell">List an item</Link>
        </Button>
      </div>

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          Icon={Package}
          label="Active listings"
          value={String(stats.activeListings)}
        />
        <StatCard
          Icon={Eye}
          label="Total views"
          value={stats.totalViews.toLocaleString("en-US")}
        />
        <StatCard
          Icon={Handshake}
          label="Pending offers"
          value={String(stats.pendingOffers)}
        />
        <StatCard
          Icon={Wallet}
          label="Listed value"
          value={formatCents(stats.listedValueCents)}
        />
      </div>

      <Tabs defaultValue="listings">
        <TabsList>
          <TabsTrigger value="listings">
            My listings ({listings.length})
          </TabsTrigger>
          <TabsTrigger value="offers">
            Offers received ({offers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listings">
          {listings.length === 0 ? (
            <EmptyState
              emoji="📦"
              title="You have not listed anything yet"
              description="Post your first item and it goes live on your campus immediately."
              action={{ href: "/sell", label: "List an item" }}
            />
          ) : (
            <ListingGrid listings={listings} />
          )}
        </TabsContent>

        <TabsContent value="offers">
          {offers.length === 0 ? (
            <EmptyState
              emoji="🤝"
              title="No offers yet"
              description="Offers on your listings show up here as they come in."
              action={{ href: "/browse", label: "See what else is live" }}
            />
          ) : (
            <div className="space-y-6">
              {pendingOffers.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {pendingOffers.length} waiting on your reply.
                </p>
              )}
              <ul className="space-y-3">
                {offers.map(offer => (
                  <li
                    key={offer.id}
                    className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-card p-4 text-card-foreground"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>
                          {initials(offer.from?.name ?? "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm">
                          <span className="font-semibold">
                            {offer.from?.name ?? "Someone"}
                          </span>{" "}
                          <span className="text-muted-foreground">on</span>{" "}
                          {offer.listing ? (
                            <Link
                              href={`/listings/${offer.listing.id}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {offer.listing.title}
                            </Link>
                          ) : (
                            <span className="italic text-muted-foreground">
                              a deleted listing
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {offer.message}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(offer.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-primary">
                        {offer.kind === "cash" && offer.amountCents !== null
                          ? formatCents(offer.amountCents)
                          : (offer.offeredItem ?? "Trade")}
                      </span>
                      <Badge
                        variant={
                          offer.status === "accepted"
                            ? "default"
                            : offer.status === "declined"
                              ? "muted"
                              : "secondary"
                        }
                      >
                        {offer.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  Icon,
  label,
  value,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
