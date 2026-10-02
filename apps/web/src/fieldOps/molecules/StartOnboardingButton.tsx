"use client";

import { startFieldOpsOnboarding } from "@/actions/fieldOps/startFieldOpsOnboarding";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { useTranslations } from "next-intl";
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
  kind = "place",
  label: labelProp,
  size = "sm",
  variant = "default",
}: {
  campaignId: string;
  territoryId: string;
  prospectId?: string | null;
  /** An event uses the same wizard with a different final step. */
  kind?: "place" | "event";
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}) {
  const t = useTranslations("fieldOps");
  const label = labelProp ?? t("onboardThisBusiness");

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
        kind,
        clientRequestId: requestId.current,
      }).catch(actionUnreachable);
      if (res.status === 200 && res.data) {
        router.push(`/field/onboard/${res.data.id}`);
      } else {
        toast.error(res.message ?? t("couldnTStartTheOnboarding"));
      }
    });

  return (
    <Button size={size} variant={variant} onClick={go} disabled={pending}>
      {pending ? t("opening") : label}
    </Button>
  );
}
