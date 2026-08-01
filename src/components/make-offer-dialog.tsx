"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Handshake, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dollarsToCents } from "@/lib/validation";
import type { ListingKind, OfferKind } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MakeOfferDialogProps {
  listingId: string;
  listingTitle: string;
  listingKind: ListingKind;
}

export function MakeOfferDialog({
  listingId,
  listingTitle,
  listingKind,
}: MakeOfferDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<OfferKind>(
    listingKind === "barter" ? "trade" : "cash"
  );
  const [amount, setAmount] = React.useState("");
  const [item, setItem] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  function reset() {
    setAmount("");
    setItem("");
    setMessage("");
    setErrors({});
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      const response = await fetch(`/api/listings/${listingId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          amountCents: kind === "cash" ? dollarsToCents(amount) : null,
          offeredItem: kind === "trade" ? item.trim() || null : null,
          message: message.trim(),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setErrors(payload.fieldErrors ?? {});
        toast.error(payload.error ?? "Could not send that offer");
        return;
      }

      toast.success("Offer sent", { description: listingTitle });
      setOpen(false);
      reset();
      // Pull the new offer into the server-rendered list.
      router.refresh();
    } catch {
      toast.error("Network error — your offer was not sent");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg" className="flex-1">
          <Handshake className="h-4 w-4" />
          {listingKind === "free" ? "Claim it" : "Make an offer"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make an offer</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {listingTitle}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["cash", "trade"] as const).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                aria-pressed={kind === option}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                  kind === option &&
                    "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {option === "cash" ? "💵 Offer cash" : "🔄 Offer a trade"}
              </button>
            ))}
          </div>

          {kind === "cash" ? (
            <Field
              label="Your offer ($)"
              htmlFor="offer-amount"
              error={errors.amountCents}
            >
              <Input
                id="offer-amount"
                inputMode="decimal"
                placeholder="120"
                value={amount}
                onChange={event => setAmount(event.target.value)}
              />
            </Field>
          ) : (
            <Field
              label="What are you offering?"
              htmlFor="offer-item"
              error={errors.offeredItem}
            >
              <Input
                id="offer-item"
                placeholder="Yamaha acoustic guitar + case"
                value={item}
                onChange={event => setItem(event.target.value)}
              />
            </Field>
          )}

          <Field label="Message" htmlFor="offer-message" error={errors.message}>
            <Textarea
              id="offer-message"
              rows={4}
              placeholder="When are you free to meet? Anything the seller should know?"
              value={message}
              onChange={event => setMessage(event.target.value)}
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Send offer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
