"use client";

import { verifyFieldOpsConsent } from "@/actions/fieldOps/verifyFieldOpsConsent";
import OtpInput from "@/components/molecules/OtpInput";
import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";

/** The owner enters the code on their own phone (online onboarding). */
export default function ConsentForm({ token }: { token: string }) {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await verifyFieldOpsConsent({ token, code });
      if (res.status === 200) setDone(true);
      else setError(res.message ?? "That code didn't work.");
    });

  if (done) {
    return (
      <p className="rounded-xl border bg-emerald-500/10 p-4 text-sm">
        Thank you. Your business can now be listed on Abonten. You can sign in
        any time with this phone number to manage it.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <OtpInput
        value={code}
        onChange={setCode}
        disabled={pending}
        error={error}
      />
      <div>
        <Button onClick={submit} disabled={pending || code.length < 4}>
          {pending ? "Checking…" : "I agree, list my business"}
        </Button>
      </div>
    </div>
  );
}
