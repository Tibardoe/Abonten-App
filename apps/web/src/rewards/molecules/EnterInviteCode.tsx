"use client";

import { bindReferralCode } from "@/actions/bindReferralCode";
import { bindResultMessage } from "@abonten/core/rewards/invite";
import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

// For a new account that signed up without the invite link: typing a
// friend's code joins their invite (first week only; the server decides).
export default function EnterInviteCode() {
  const router = useRouter();
  const inputId = useId();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "info" | "error";
    text: string;
  } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!normalizeReferralCode(code)) {
      setMessage({ tone: "error", text: "Enter the 7-character invite code." });
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const res = await bindReferralCode({ code });
      if (!res.data) {
        setMessage({ tone: "error", text: res.message ?? "Please sign in." });
        return;
      }
      setMessage(bindResultMessage(res.data));
      if (res.data.result === "bound") router.refresh();
    } catch {
      setMessage({
        tone: "error",
        text: "We couldn't apply the invite. Please try again.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        Joined because a friend invited you? Enter their code
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={9}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="K7QX2MA"
          aria-invalid={message?.tone === "error"}
          className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 py-2 font-mono tracking-[0.2em] outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={pending || code.trim().length === 0}
          className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Applying…" : "Apply"}
        </button>
      </div>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error"
              ? "text-sm text-destructive"
              : "text-sm text-foreground"
          }
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
