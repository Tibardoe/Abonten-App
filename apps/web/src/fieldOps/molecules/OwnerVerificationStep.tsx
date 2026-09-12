"use client";

import { requestFieldOpsOwnerOtp } from "@/actions/fieldOps/requestFieldOpsOwnerOtp";
import { verifyFieldOpsOwnerOtp } from "@/actions/fieldOps/verifyFieldOpsOwnerOtp";
import OtpInput from "@/components/molecules/OtpInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/useToast";
import { useState, useTransition } from "react";

/**
 * Proving who the owner is, shared by the business and event wizards. The
 * code always goes to the OWNER's phone — never the member's — and online
 * members get a link the owner opens themselves so the code never passes
 * through the worker at all.
 */
export default function OwnerVerificationStep({
  campaignId,
  onboardingId,
  noun,
  verified,
  onVerified,
  fullName,
  phone,
  onFullName,
  onPhone,
}: {
  campaignId: string;
  onboardingId: string;
  /** "owner" for a business, "organiser" for an event. */
  noun: string;
  verified: boolean;
  onVerified: () => void;
  fullName: string;
  phone: string;
  onFullName: (v: string) => void;
  onPhone: (v: string) => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [consentPath, setConsentPath] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const send = () =>
    start(async () => {
      const res = await requestFieldOpsOwnerOtp({
        campaignId,
        onboardingId,
        ownerFullName: fullName.trim(),
        ownerPhoneE164: phone.trim(),
      });
      if (res.status === 200) {
        setSent(true);
        setConsentPath(res.data?.consentPath ?? null);
        toast.success(`Code sent to the ${noun}.`);
      } else {
        toast.error(res.message ?? "Couldn't send the code.");
      }
    });

  const verify = (value: string) =>
    start(async () => {
      const res = await verifyFieldOpsOwnerOtp({
        campaignId,
        onboardingId,
        code: value,
      });
      if (res.status === 200) {
        toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} verified.`);
        onVerified();
      } else {
        toast.error(res.message ?? "That code didn't work.");
      }
    });

  if (verified) {
    return (
      <p className="rounded-md bg-emerald-500/10 p-3 text-sm">
        Verified. Their Abonten account will own this from the start.
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        A code goes to the {noun}&apos;s phone. By entering it they agree to
        list on Abonten. It must be their own number, not yours.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ov-name">{noun}&apos;s full name</Label>
          <Input
            id="ov-name"
            value={fullName}
            onChange={(e) => onFullName(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ov-phone">Phone number</Label>
          <Input
            id="ov-phone"
            inputMode="tel"
            placeholder="024 123 4567"
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
          />
        </div>
      </div>
      <Button
        type="button"
        onClick={send}
        disabled={
          pending || fullName.trim().length < 2 || phone.trim().length < 9
        }
      >
        {sent ? "Send another code" : "Send the code"}
      </Button>
      {sent ? (
        <div className="flex flex-col gap-2">
          {consentPath ? (
            <p className="rounded-md border border-dashed p-3 text-sm">
              Working over the phone? Send them this link so they enter the code
              themselves:{" "}
              <span className="break-all font-mono text-xs">
                {typeof window !== "undefined" ? window.location.origin : ""}
                {consentPath}
              </span>
            </p>
          ) : null}
          <Label>Code from their phone</Label>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (v.length === 4) verify(v);
            }}
            length={4}
          />
        </div>
      ) : null}
    </>
  );
}
