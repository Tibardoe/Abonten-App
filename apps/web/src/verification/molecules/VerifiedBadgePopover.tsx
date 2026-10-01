"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BADGE_EXPLANATION,
  BADGE_LABEL,
} from "@abonten/core/verification/copy";
import type { VerificationSubjectType } from "@abonten/types/verificationType";
import { useTranslations } from "next-intl";
import { IoCheckmarkCircle } from "react-icons/io5";

// The public Verified badge. Tapping it explains what Abonten actually
// checked — the wording is the legal-reviewed text in
// @abonten/core/verification/copy and must not be paraphrased here.

export default function VerifiedBadgePopover({
  subjectType,
  className,
  compact = false,
}: {
  subjectType: VerificationSubjectType;
  className?: string;
  /** Icon only, for tight rows like cards. */
  compact?: boolean;
}) {
  const t = useTranslations("verification");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("whatThisMeans", { item: BADGE_LABEL[subjectType] })}
          className={`inline-flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-80 ${
            className ?? ""
          }`}
        >
          <IoCheckmarkCircle aria-hidden className="text-base" />
          {compact ? null : t("verified")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="start">
        <p className="font-semibold">{BADGE_LABEL[subjectType]}</p>
        <p className="mt-1 text-muted-foreground">
          {BADGE_EXPLANATION[subjectType]}
        </p>
      </PopoverContent>
    </Popover>
  );
}
