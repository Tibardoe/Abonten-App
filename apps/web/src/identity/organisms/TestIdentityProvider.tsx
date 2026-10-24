"use client";

import { completeTestIdentity } from "@/actions/identity/completeTestIdentity";
import { Button } from "@/components/ui/button";
import { SupportingText } from "@/components/ui/typography";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import type { CompleteTestIdentityInput } from "@abonten/validation/identitySchemas";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

// What a real provider decides, picked by hand. Each choice runs the same
// pipeline a provider's callback does (duplicates, age, review rules).

const OUTCOMES: CompleteTestIdentityInput["outcome"][] = [
  "clear",
  "attention",
  "block",
  "error",
  "underage",
];

export default function TestIdentityProvider() {
  const t = useTranslations("identity");
  const toast = useToast();
  const params = useSearchParams();
  const verificationId = params.get("v") ?? "";
  // Where the real provider would send the person next (same site only).
  const requested = params.get("r") ?? "";
  const back =
    requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : `/settings/identity?checked=${verificationId}`;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const pick = async (outcome: CompleteTestIdentityInput["outcome"]) => {
    setBusy(true);
    const res = await completeTestIdentity({ verificationId, outcome }).catch(
      actionUnreachable,
    );
    setBusy(false);
    if (res.status === 200) {
      setDone(true);
    } else {
      toast.error(res.message ?? t("couldNotSave"));
    }
  };

  return (
    <div className="flex max-w-md flex-col gap-4">
      <SupportingText>{done ? t("testDone") : t("testIntro")}</SupportingText>
      {done ? (
        <Link className="underline" href={back}>
          {t("testBack")}
        </Link>
      ) : null}
      {(done ? [] : OUTCOMES).map((outcome) => (
        <Button
          key={outcome}
          variant={outcome === "clear" ? "default" : "outline"}
          disabled={busy || !verificationId}
          onClick={() => void pick(outcome)}
        >
          {t("testOutcome", { outcome })}
        </Button>
      ))}
    </div>
  );
}
