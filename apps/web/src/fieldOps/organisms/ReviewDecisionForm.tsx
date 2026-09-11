"use client";

import { reviewFieldOpsOnboarding } from "@/actions/fieldOps/reviewFieldOpsOnboarding";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
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
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");

  const decide = (decision: "verified" | "needs_changes" | "rejected") =>
    start(async () => {
      if (decision !== "verified" && note.trim().length < 3) {
        toast.error("Tell the member what to change, or why it was rejected.");
        return;
      }
      if (
        decision === "rejected" &&
        !confirm("Reject this onboarding? The member is told why.")
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
        toast.success(res.message ?? "Saved.");
        router.push("/field/lead/review");
        router.refresh();
      } else {
        toast.error(res.message ?? "Couldn't save the decision.");
      }
    });

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-semibold">Your decision</h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor="review-note">
          Note to the member (required unless verifying)
        </Label>
        <Textarea
          id="review-note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. The interior photo is blurry; retake it."
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide("verified")} disabled={pending}>
          Verify
        </Button>
        <Button
          variant="outline"
          onClick={() => decide("needs_changes")}
          disabled={pending}
        >
          Ask for changes
        </Button>
        <Button
          variant="destructive"
          onClick={() => decide("rejected")}
          disabled={pending}
        >
          Reject
        </Button>
      </div>
    </section>
  );
}
