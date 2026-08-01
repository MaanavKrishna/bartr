import type { Metadata } from "next";

import { CreateListingForm } from "@/components/create-listing-form";

export const metadata: Metadata = {
  title: "List an item",
  description:
    "Post something for sale, for trade, or for free on your campus.",
};

export default function SellPage() {
  return (
    <div className="container max-w-3xl py-12">
      <div className="mb-10 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">List an item</h1>
        <p className="text-muted-foreground">
          Takes about a minute. You can sell it, swap it, or give it away — your
          listing goes live on your campus immediately.
        </p>
      </div>

      <CreateListingForm />
    </div>
  );
}
