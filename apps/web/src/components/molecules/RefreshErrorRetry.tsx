"use client";

import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { useRouter } from "next/navigation";

// For a page rendered on the server whose read failed: says so, and "Try
// again" asks the server for the page once more. The alternative was an
// empty state ("No payouts yet"), which says something that is not known.
export default function RefreshErrorRetry({ message }: { message: string }) {
  const router = useRouter();
  return (
    <InlineErrorRetry message={message} onRetry={() => router.refresh()} />
  );
}
