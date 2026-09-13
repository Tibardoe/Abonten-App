"use client";

import { Button, Card } from "@/components/ui";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

// A page that throws used to fall through to Next's default screen, which
// tells an operator nothing and offers no way back. This reports the error
// and gives them one.
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg p-6 text-center">
      <h1 className="text-lg font-semibold">This page didn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Something went wrong while loading it. The error has been reported. Try
        again — if it keeps happening, check Monitoring for a wider problem.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <a
          href="/monitoring"
          className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-sm hover:bg-muted"
        >
          Monitoring
        </a>
      </div>
    </Card>
  );
}
