"use client";

import { reviewFieldOpsContent } from "@/actions/fieldOps/reviewFieldOpsContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Approve or reject one deliverable. A reject needs a reason. */
export default function ContentReviewRow({
  campaignId,
  submissionId,
}: {
  campaignId: string;
  submissionId: string;
}) {
  const t = useTranslations("fieldOps");

  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");

  const decide = (decision: "approved" | "rejected") =>
    start(async () => {
      const res = await reviewFieldOpsContent({
        campaignId,
        submissionId,
        decision,
        note: note.trim() || null,
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message ?? t("saved"));
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTSaveTheDecision"));
      }
    });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Input
        className="min-w-0 flex-1"
        placeholder={t("noteRequiredToReject")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button size="sm" onClick={() => decide("approved")} disabled={pending}>
        {t("approve")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => decide("rejected")}
        disabled={pending || note.trim().length < 3}
      >
        {t("reject")}
      </Button>
    </div>
  );
}
