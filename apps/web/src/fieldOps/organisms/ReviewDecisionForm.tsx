"use client";

import { reviewFieldOpsOnboarding } from "@/actions/fieldOps/reviewFieldOpsOnboarding";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Verify / return / reject a submitted onboarding (team lead). */
export default function ReviewDecisionForm({
  campaignId,
  onboardingId,
}: {
  campaignId: string;
  onboardingId: string;
}) {
  const t = useTranslations("fieldOps");

  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");

  const decide = (decision: "verified" | "needs_changes" | "rejected") =>
    start(async () => {
      if (decision !== "verified" && note.trim().length < 3) {
        toast.error(t("tellTheMemberWhatToChange"));
        return;
      }
      if (
        decision === "rejected" &&
        !confirm(t("rejectThisOnboardingTheMemberIs"))
      ) {
        return;
      }
      const res = await reviewFieldOpsOnboarding({
        campaignId,
        onboardingId,
        decision,
        note: note.trim() || null,
      });
      if (res.status === 200) {
        toast.success(res.message ?? t("saved"));
        router.push("/field/lead/review");
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTSaveTheDecision"));
      }
    });

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t("yourDecision")}</h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor="review-note">
          {t("noteToTheMemberRequiredUnless")}
        </Label>
        <Textarea
          id="review-note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("eGTheInteriorPhotoIs")}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide("verified")} disabled={pending}>
          {t("verify")}
        </Button>
        <Button
          variant="outline"
          onClick={() => decide("needs_changes")}
          disabled={pending}
        >
          {t("askForChanges")}
        </Button>
        <Button
          variant="destructive"
          onClick={() => decide("rejected")}
          disabled={pending}
        >
          {t("reject")}
        </Button>
      </div>
    </section>
  );
}
