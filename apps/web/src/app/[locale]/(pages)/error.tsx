"use client";

import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/reportClientError";
import * as Sentry from "@sentry/nextjs";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("common");

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
        {t("thisPageDidnTLoad")}
      </h1>
      <p className="text-sm text-muted-foreground">
        {t("somethingWentWrongOnOurSide")}
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          {t("reference", { digest: error.digest })}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={() => reset()}>{t("tryAgain")}</Button>
        <Button asChild variant="outline">
          <Link href="/explore">{t("exploreEventsAndPlaces")}</Link>
        </Button>
      </div>
    </section>
  );
}
