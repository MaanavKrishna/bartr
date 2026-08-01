"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // The server log has the stack; the digest is what ties them together.
    console.error("Unhandled app error", error);
  }, [error]);

  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span aria-hidden className="text-4xl">
        💥
      </span>
      <h1 className="text-2xl font-bold tracking-tight">
        Something broke on our side
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This one is on us, not you. Try again — and if it keeps happening, the
        error id below helps us find it.
      </p>
      {error.digest && (
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
          {error.digest}
        </code>
      )}
      <Button onClick={reset} className="mt-2">
        <RotateCcw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
