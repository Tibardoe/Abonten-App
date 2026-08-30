"use client";

import { cn } from "@/components/lib/utils";
import {
  formatCountdown,
  useCheckoutCountdown,
} from "@/hooks/useCheckoutCountdown";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type CheckoutExpiryBannerProps = {
  expiresAt: string | null;
};

/**
 * Countdown for a pending checkout, driven entirely by the server's
 * expires_at timestamp (see useCheckoutCountdown). When the countdown
 * reaches zero this refreshes the current route once — getTicketCheckout and
 * the promotion checkout actions all self-heal by re-running their expiry
 * sweep on every read, so the refresh re-renders straight into the
 * "expired" state server-side, instead of this component trying to disable
 * sibling payment buttons it has no reference to.
 */
export default function CheckoutExpiryBanner({
  expiresAt,
}: CheckoutExpiryBannerProps) {
  const { secondsLeft, isExpired, isWarning } = useCheckoutCountdown(expiresAt);
  const router = useRouter();
  const hasRefreshed = useRef(false);

  useEffect(() => {
    if (isExpired && !hasRefreshed.current) {
      hasRefreshed.current = true;
      router.refresh();
    }
  }, [isExpired, router]);

  if (secondsLeft === null) return null;

  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3 text-sm font-medium text-center",
        isExpired
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : isWarning
            ? "border-destructive/40 bg-destructive/10 text-destructive animate-pulse"
            : "border-border bg-muted text-muted-foreground",
      )}
    >
      {isExpired
        ? "This checkout has expired."
        : `Checkout expires in ${formatCountdown(secondsLeft)}`}
    </div>
  );
}
