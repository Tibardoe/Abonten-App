"use client";

import PageErrorScreen from "@/components/organisms/PageErrorScreen";

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
  return <PageErrorScreen error={error} reset={reset} boundary="pages" />;
}
