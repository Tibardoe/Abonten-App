"use client";

import type { PlaceSetup } from "@abonten/core/placeSetup";
import { VERIFICATION_CHIP_LABEL } from "@abonten/core/verification/copy";
import type { VerificationStatus } from "@abonten/types/verificationType";
import { IoCheckmarkCircle } from "react-icons/io5";

// "Finish setting up your place" — the same shape as
// ProfileCompletionChecklist.tsx, but each row jumps to the tab that fixes
// it instead of navigating away.
//
// Deliberately a count, not a percentage: see the note in
// @abonten/core/placeSetup for why a percent would be meaningless here.
// Disappears entirely once everything is done, so a finished place never
// carries permanent visual noise.

const CHIP_TONE: Record<VerificationStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-muted text-muted-foreground",
  needs_info: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-mint/15 text-mint",
  rejected: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
  revoked: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export default function PlaceSetupChecklist({
  setup,
  onGoToTab,
}: {
  setup: PlaceSetup;
  onGoToTab: (tab: string) => void;
}) {
  if (setup.isComplete) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Finish setting up your place</h2>
        <span className="text-sm text-muted-foreground">
          {setup.completedCount}/{setup.total}
        </span>
      </div>

      <ul className="space-y-2">
        {setup.items.map((item) => {
          const status = item.statusLabel as VerificationStatus | null;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onGoToTab(item.tab)}
                className="flex w-full items-center gap-2 text-left text-sm transition-colors hover:text-primary"
              >
                <IoCheckmarkCircle
                  aria-hidden
                  className={`shrink-0 text-lg ${
                    item.complete ? "text-mint" : "text-border"
                  }`}
                />
                <span
                  className={
                    item.complete ? "text-muted-foreground line-through" : ""
                  }
                >
                  {item.label}
                </span>
                {item.key === "verification" && status && !item.complete ? (
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs ${CHIP_TONE[status]}`}
                  >
                    {VERIFICATION_CHIP_LABEL[status]}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
