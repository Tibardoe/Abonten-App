"use client";

import { rememberInviteCode } from "@/actions/rememberInviteCode";
import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

// "Have an invite code?" on the sign-in screen. The code is kept in the
// signed referral cookie and applied once sign-in finishes, whichever way
// the person signs in. Filled in already when they came from an invite link.
export default function InviteCodeField({
  initialCode,
}: {
  initialCode: string | null;
}) {
  const t = useTranslations("rewards");

  const inputId = useId();
  const [open, setOpen] = useState(!!initialCode);
  const [code, setCode] = useState(initialCode ?? "");
  const [saved, setSaved] = useState<string | null>(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto block text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
      >
        {t("haveAnInviteCode")}
      </button>
    );
  }

  const save = async () => {
    const normalized = normalizeReferralCode(code);
    if (!normalized) {
      setError(t("enterThe7CharacterInviteCode"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await rememberInviteCode(normalized);
      if (res.status === 200) {
        setSaved(normalized);
        setCode(normalized);
      } else {
        setError(res.message ?? t("enterThe7CharacterInviteCode"));
      }
    } catch {
      setError(t("couldnTSaveTheCodePlease"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-md border border-border p-3 text-left">
      <label htmlFor={inputId} className="text-sm font-medium">
        {t("inviteCode")}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={inputId}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setSaved(null);
            setError(null);
          }}
          maxLength={9}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="K7QX2MA"
          aria-invalid={!!error}
          className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 py-2 font-mono tracking-[0.2em] outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || code.trim().length === 0 || saved === code}
          className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saved === code && saved
            ? t("saved")
            : pending
              ? t("saving")
              : t("save")}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : saved ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("weLlApplyItWhenYou")}
        </p>
      ) : null}
    </div>
  );
}
