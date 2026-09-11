"use client";

import { startFieldOpsOnboarding } from "@/actions/fieldOps/startFieldOpsOnboarding";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

/**
 * Opens (or resumes) an onboarding and jumps into the wizard. The request
 * id is fixed per button instance so a double tap never opens two drafts.
 */
export default function StartOnboardingButton({
  campaignId,
  territoryId,
  prospectId,
  label = "Onboard this business",
  size = "sm",
  variant = "default",
}: {
  campaignId: string;
  territoryId: string;
  prospectId?: string | null;
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const requestId = useRef(crypto.randomUUID());

  const go = () =>
    start(async () => {
      const res = await startFieldOpsOnboarding({
        campaignId,
        territoryId,
        prospectId: prospectId ?? null,
        clientRequestId: requestId.current,
      });
      if (res.status === 200 && res.data) {
        router.push(`/field/onboard/${res.data.id}`);
      } else {
        toast.error(res.message ?? "Couldn't start the onboarding.");
      }
    });

  return (
    <Button size={size} variant={variant} onClick={go} disabled={pending}>
      {pending ? "Opening…" : label}
    </Button>
  );
}
