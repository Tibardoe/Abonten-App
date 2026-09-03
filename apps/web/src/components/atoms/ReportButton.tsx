"use client";

import { ReportDialog } from "@/components/organisms/ReportDialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { ReportTargetType } from "@abonten/types/adminTypes";
import { Flag } from "lucide-react";
import { useState } from "react";

// Drop-in "Report" affordance for public detail pages (event, place,
// profile, reviews). Hidden for signed-out visitors and for the owner of
// the content, matching the mobile gating. Opens the shared ReportDialog.
export default function ReportButton({
  targetType,
  targetId,
  targetLabel,
  ownerId,
  variant = "link",
  className,
}: {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  /** if provided and equal to the viewer, the button is hidden */
  ownerId?: string | null;
  variant?: "link" | "icon";
  className?: string;
}) {
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);

  if (!user) return null;
  if (ownerId && ownerId === user.id) return null;

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          aria-label={`Report this ${targetType}`}
          onClick={() => setOpen(true)}
          className={
            className ??
            "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          }
        >
          <Flag className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            className ??
            "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive"
          }
        >
          <Flag className="h-4 w-4" />
          Report
        </button>
      )}
      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        targetType={targetType}
        targetId={targetId}
        targetLabel={targetLabel}
      />
    </>
  );
}
