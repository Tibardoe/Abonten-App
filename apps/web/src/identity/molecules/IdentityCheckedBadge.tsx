"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  identityBadgeExplanation,
  identityBadgeLabel,
} from "@abonten/core/identity/copy";
import { useTranslations } from "next-intl";
import { IoIdCardOutline } from "react-icons/io5";

// "ID checked": the person behind this organizer or place showed Abonten a
// government ID and a live selfie. Tapping it says exactly that, in the
// fixed words of @abonten/core/identity/copy, and nothing from the document.

export default function IdentityCheckedBadge({
  compact = false,
  className,
}: {
  /** Icon only, for tight rows. */
  compact?: boolean;
  className?: string;
}) {
  const tc = useTranslations("core");
  const label = identityBadgeLabel(tc);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={`inline-flex items-center gap-1 text-sm font-medium text-emerald-700 transition-opacity hover:opacity-80 dark:text-emerald-400 ${
            className ?? ""
          }`}
        >
          <IoIdCardOutline aria-hidden className="text-base" />
          {compact ? null : label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="start">
        <p className="font-semibold">{label}</p>
        <p className="mt-1 text-muted-foreground">
          {identityBadgeExplanation(tc)}
        </p>
      </PopoverContent>
    </Popover>
  );
}
