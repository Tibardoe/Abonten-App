"use client";

import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/reportClientError";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

// Any page under the main layout that throws lands here instead of
// unmounting the whole document (global-error.tsx is only for failures in
// the root layout itself). The header and navigation stay, the error is
// reported to both pipelines, and the person gets a retry that re-renders
// just the failed segment.
export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      extra: { digest: error.digest, boundary: "pages" },
    });
    Sentry.captureException(error);
  }, [error]);

  return (
    <section
      aria-labelledby="page-error-title"
      className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 text-center"
    >
      <h1 id="page-error-title" className="text-2xl font-semibold">
        This page didn&apos;t load
      </h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong on our side. It has been reported. You can try
        again, or head back to discovery.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/explore">Explore events and places</Link>
        </Button>
      </div>
    </section>
  );
}
