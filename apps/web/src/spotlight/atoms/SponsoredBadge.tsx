import { cn } from "@/components/lib/utils";
import { SPONSORED_LABEL_KEY } from "@abonten/core/content/copy";
import { useTranslations } from "next-intl";

// The paid-placement disclosure. Every promoted slot shows it, in the same
// place, and it can never be hidden by the publisher.
export default function SponsoredBadge({ className }: { className?: string }) {
  const tc = useTranslations("core");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-black",
        className,
      )}
    >
      {tc(SPONSORED_LABEL_KEY)}
    </span>
  );
}
