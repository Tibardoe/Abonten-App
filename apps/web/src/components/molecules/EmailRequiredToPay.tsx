"use client";

import OtpInput from "@/components/molecules/OtpInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/config/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
import {
  EMAIL_OTP_CODE_LENGTH,
  EMAIL_OTP_MESSAGES,
  isLikelyEmail,
  maskEmail,
} from "@abonten/core/emailOtp";
import { useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useState } from "react";

// Asked at the moment it matters: every payment needs an email on the
// account (createMultiCheckoutPaymentAttemptCore and the promotion attempts
// refuse without one — Paystack charges against it, and the ticket and
// receipt are emailed there). Accounts made with a phone number have none,
// so checkout offers to add one right here with a 6-digit code, without
// leaving the order. Never silenced — it only appears when "Pay" would
// otherwise fail. (Changing an existing email is Settings › Security.)

export function useNeedsEmailToPay(): boolean {
  const { data: user } = useCurrentUser();
  return !!user && !user.email;
}

export default function EmailRequiredToPay({
  purpose = "tickets",
}: {
  purpose?: "tickets" | "promotion";
}) {
  const needsEmail = useNeedsEmailToPay();
  const [open, setOpen] = useState(false);
  if (!needsEmail) return null;

  return (
    <div className="space-y-3 rounded-xl border border-warning/50 bg-card p-4">
      <div className="flex gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="font-semibold">Add your email to pay</p>
          <p className="text-sm text-muted-foreground">
            {purpose === "tickets"
              ? "Card and mobile money payments need an email. Your tickets and receipt are sent there."
              : "Card and mobile money payments need an email. Your receipt is sent there."}
          </p>
        </div>
      </div>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Add email
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add your email</DialogTitle>
            <DialogDescription>
              We&apos;ll send a 6-digit code to check it&apos;s yours. You stay
              signed in.
            </DialogDescription>
          </DialogHeader>
          {open ? <AddEmailForm onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddEmailForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const next = (pending ?? email).trim().toLowerCase();
    if (!isLikelyEmail(next)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The "Confirm email change" template carries {{ .Token }} — see
      // docs/architecture/email-auth.md.
      const { error: e } = await supabase.auth.updateUser({ email: next });
      if (e) {
        const conflict =
          e.status === 422 ||
          /already.*(registered|exists|in use)/i.test(e.message);
        setError(
          conflict
            ? "That email can't be used."
            : "Couldn't send a code. Please try again.",
        );
        return;
      }
      setPending(next);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pending || code.length < EMAIL_OTP_CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.verifyOtp({
        email: pending,
        token: code,
        type: "email_change",
      });
      if (e) {
        setError(EMAIL_OTP_MESSAGES.invalidOrExpired);
        return;
      }
      await supabase.auth.refreshSession();
      await queryClient.invalidateQueries({ queryKey: ["auth-user"] });
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "profile-completion",
      });
      toast.success("Email added. You can pay now.");
      onDone();
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    return (
      <form onSubmit={verify} className="space-y-3">
        <p className="text-sm">Enter the code sent to {maskEmail(pending)}.</p>
        <OtpInput
          length={EMAIL_OTP_CODE_LENGTH}
          value={code}
          onChange={setCode}
          disabled={busy}
          error={error}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={busy || code.length < EMAIL_OTP_CODE_LENGTH}
          >
            {busy ? "Verifying…" : "Verify"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => send()}
          >
            Resend code
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setPending(null);
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <Input
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send code"}
      </Button>
    </form>
  );
}
