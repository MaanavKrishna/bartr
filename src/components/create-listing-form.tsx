"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CAMPUSES,
  CATEGORY_META,
  CONDITION_META,
  KIND_META,
} from "@/lib/constants";
import { CATEGORIES, CONDITIONS, LISTING_KINDS } from "@/lib/types";
import {
  dollarsToCents,
  listingFormSchema,
  splitList,
  type ListingFormValues,
} from "@/lib/validation";
import { cn } from "@/lib/utils";

export function CreateListingForm() {
  const router = useRouter();

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    mode: "onBlur",
    defaultValues: {
      title: "",
      description: "",
      kind: "sale",
      price: "",
      wants: "",
      category: "other",
      condition: "good",
      campus: CAMPUSES[0],
      meetupSpot: "",
      tags: "",
    },
  });

  const kind = form.watch("kind");
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ListingFormValues) {
    try {
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          description: values.description,
          kind: values.kind,
          priceCents:
            values.kind === "sale" ? dollarsToCents(values.price) : null,
          wants: values.kind === "barter" ? splitList(values.wants) : [],
          category: values.category,
          condition: values.condition,
          campus: values.campus,
          meetupSpot: values.meetupSpot,
          tags: splitList(values.tags),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        // Map server-side field errors back onto the form where they belong.
        const fieldErrors: Record<string, string> = payload.fieldErrors ?? {};
        for (const [field, message] of Object.entries(fieldErrors)) {
          if (field in values) {
            form.setError(field as keyof ListingFormValues, { message });
          }
        }
        toast.error(payload.error ?? "Could not publish that listing");
        return;
      }

      toast.success("Listing published", { description: values.title });
      router.push(`/listings/${payload.listing.id}`);
      router.refresh();
    } catch {
      toast.error("Network error — your listing was not saved");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      <Fieldset
        legend="What are you listing?"
        hint="A clear title and an honest description get the most offers."
      >
        <Field label="Title" htmlFor="title" error={errors.title?.message}>
          <Input
            id="title"
            placeholder="Steel road bike, 54cm — tuned last week"
            {...form.register("title")}
          />
        </Field>

        <Field
          label="Description"
          htmlFor="description"
          error={errors.description?.message}
        >
          <Textarea
            id="description"
            rows={6}
            placeholder="Condition, quirks, what's included, why you're parting with it…"
            {...form.register("description")}
          />
        </Field>
      </Fieldset>

      <Fieldset legend="How do you want to deal?">
        <div className="grid gap-2 sm:grid-cols-3">
          {LISTING_KINDS.map(option => (
            <button
              key={option}
              type="button"
              onClick={() =>
                form.setValue("kind", option, { shouldValidate: true })
              }
              aria-pressed={kind === option}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                kind === option && "border-primary bg-primary/5"
              )}
            >
              <span aria-hidden className="text-lg">
                {KIND_META[option].emoji}
              </span>
              <p className="text-sm font-semibold">{KIND_META[option].label}</p>
              <p className="text-xs text-muted-foreground">
                {option === "sale"
                  ? "Set a cash price"
                  : option === "barter"
                    ? "Swap for something"
                    : "Give it away"}
              </p>
            </button>
          ))}
        </div>

        {kind === "sale" && (
          <Field
            label="Price ($)"
            htmlFor="price"
            error={errors.price?.message}
          >
            <Input
              id="price"
              inputMode="decimal"
              placeholder="220"
              {...form.register("price")}
            />
          </Field>
        )}

        {kind === "barter" && (
          <Field
            label="What would you trade for?"
            htmlFor="wants"
            error={errors.wants?.message}
            hint="Comma separated — up to 8."
          >
            <Input
              id="wants"
              placeholder="Ergonomic chair, desk lamp + cash"
              {...form.register("wants")}
            />
          </Field>
        )}
      </Fieldset>

      <Fieldset legend="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Category"
            htmlFor="category"
            error={errors.category?.message}
          >
            <Select
              value={form.watch("category")}
              onValueChange={value =>
                form.setValue(
                  "category",
                  value as ListingFormValues["category"],
                  {
                    shouldValidate: true,
                  }
                )
              }
            >
              <SelectTrigger id="category">
                <SelectValue>
                  {CATEGORY_META[form.watch("category")].emoji}{" "}
                  {CATEGORY_META[form.watch("category")].label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>
                    {CATEGORY_META[category].emoji}{" "}
                    {CATEGORY_META[category].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Condition"
            htmlFor="condition"
            error={errors.condition?.message}
          >
            <Select
              value={form.watch("condition")}
              onValueChange={value =>
                form.setValue(
                  "condition",
                  value as ListingFormValues["condition"],
                  { shouldValidate: true }
                )
              }
            >
              <SelectTrigger id="condition">
                <SelectValue>
                  {CONDITION_META[form.watch("condition")].label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map(condition => (
                  <SelectItem key={condition} value={condition}>
                    {CONDITION_META[condition].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Campus" htmlFor="campus" error={errors.campus?.message}>
            <Select
              value={form.watch("campus")}
              onValueChange={value =>
                form.setValue("campus", value as ListingFormValues["campus"], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="campus">
                <SelectValue>{form.watch("campus")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CAMPUSES.map(campus => (
                  <SelectItem key={campus} value={campus}>
                    {campus}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Meetup spot"
            htmlFor="meetupSpot"
            error={errors.meetupSpot?.message}
          >
            <Input
              id="meetupSpot"
              placeholder="Baker Library steps"
              {...form.register("meetupSpot")}
            />
          </Field>
        </div>

        <Field
          label="Tags"
          htmlFor="tags"
          error={errors.tags?.message}
          hint="Comma separated — these power search."
        >
          <Input
            id="tags"
            placeholder="bike, commuter, steel"
            {...form.register("tags")}
          />
        </Field>
      </Fieldset>

      <div className="flex items-center justify-end gap-3 border-t pt-6">
        <Button
          type="button"
          variant="ghost"
          onClick={() => form.reset()}
          disabled={isSubmitting}
        >
          Reset
        </Button>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Publish listing
        </Button>
      </div>
    </form>
  );
}

function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <div>
        <legend className="text-lg font-semibold">{legend}</legend>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
