"use client";

import PageErrorScreen from "@/components/organisms/PageErrorScreen";

// The pages outside the main layout (the landing page, the restricted
// account notice) and that layout itself. Without this, an error there
// fell through to global-error.tsx: a bare document in system fonts with
// no theme and no way on but "Try again".
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageErrorScreen error={error} reset={reset} boundary="locale" standalone />
  );
}
