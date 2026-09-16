import { cn } from "@/components/lib/utils";
import { SPONSORED_LABEL } from "@abonten/core/content/copy";

// The paid-placement disclosure. Every promoted slot shows it, in the same
// place, and it can never be hidden by the publisher.
export default function SponsoredBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-black",
        className,
      )}
    >
      {SPONSORED_LABEL}
    </span>
  );
}
