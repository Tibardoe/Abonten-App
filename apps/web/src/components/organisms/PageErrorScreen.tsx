"use client";

import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/reportClientError";
import * as Sentry from "@sentry/nextjs";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";

type PageErrorScreenProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Which error.tsx caught it; reported with the error. */
  boundary: string;
  /** No header or footer around it: fill the window. */
  standalone?: boolean;
};

// What an error.tsx shows: the error is reported to both pipelines, and the
// person gets a retry that re-renders just the failed part, and a way on.
export default function PageErrorScreen({
  error,
  reset,
  boundary,
  standalone = false,
}: PageErrorScreenProps) {
  const t = useTranslations("common");

  useEffect(() => {
    reportClientError(error, {
      extra: { digest: error.digest, boundary },
    });
    Sentry.captureException(error);
  }, [error, boundary]);

  return (
    <section
      aria-labelledby="page-error-title"
      className={`mx-auto flex w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center ${
        standalone ? "min-h-dvh" : "min-h-[50vh]"
      }`}
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
