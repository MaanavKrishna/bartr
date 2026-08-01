import Link from "next/link";

import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  emoji?: string;
  title: string;
  description: string;
  action?: { href: string; label: string };
}

export function EmptyState({
  emoji = "🔍",
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
      <span aria-hidden className="text-4xl">
        {emoji}
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {action && (
        <Button asChild className="mt-6">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
