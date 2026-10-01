"use client";

import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { reportClientError } from "@/lib/reportClientError";
import Link from "next/link";
import { useEffect } from "react";

// Abonten Weekly failed to render. Report it, offer a retry, and keep the way
// to the rest of discovery open.
export default function WeeklyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, { route: "/weekly" });
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <InlineErrorRetry
        message="Abonten Weekly couldn't be loaded right now."
        onRetry={reset}
      />
      <p className="text-center text-sm">
        <Link href="/explore" className="text-primary underline">
          Explore events and places instead
        </Link>
      </p>
    </div>
  );
}
