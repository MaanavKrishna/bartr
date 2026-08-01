"use client";

import { Heart } from "lucide-react";
import { toast } from "sonner";

import { useSavedListings } from "@/components/saved-listings-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SaveButtonProps {
  listingId: string;
  title: string;
  /** `icon` for the card overlay, `full` for the detail page. */
  variant?: "icon" | "full";
  className?: string;
}

export function SaveButton({
  listingId,
  title,
  variant = "icon",
  className,
}: SaveButtonProps) {
  const { isSaved, toggle, hydrated } = useSavedListings();
  const saved = hydrated && isSaved(listingId);

  function onClick(event: React.MouseEvent) {
    // Cards wrap the button in a link; don't navigate on save.
    event.preventDefault();
    event.stopPropagation();
    const nowSaved = toggle(listingId);
    toast[nowSaved ? "success" : "message"](
      nowSaved ? "Saved" : "Removed from saved",
      { description: title }
    );
  }

  if (variant === "full") {
    return (
      <Button
        type="button"
        variant={saved ? "secondary" : "outline"}
        onClick={onClick}
        aria-pressed={saved}
        className={className}
      >
        <Heart className={cn("h-4 w-4", saved && "fill-current text-accent")} />
        {saved ? "Saved" : "Save"}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Unsave ${title}` : `Save ${title}`}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-full bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition hover:scale-105 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        saved && "text-accent",
        className
      )}
    >
      <Heart className={cn("h-4 w-4", saved && "fill-current")} />
    </button>
  );
}
