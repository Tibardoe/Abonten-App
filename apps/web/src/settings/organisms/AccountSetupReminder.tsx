"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAccountSetupPrompt } from "@/hooks/useProfileCompletion";
import { accountSetupPromptMessage } from "@abonten/core/accountSetupPrompt";
import { UserRoundCheck, X } from "lucide-react";
import Link from "next/link";

// "Finish setting up your account" — a card in the page, never a pop-up.
// "Not now" puts it away for 7, then 30, then 90 days, on every device
// (account_setup_prompt_state); it never comes back once every step is done.
// What an action genuinely needs (an email to pay) is asked for at that
// moment instead, whatever this card's state. Same rules as the app.
export default function AccountSetupReminder({
  className,
}: {
  className?: string;
}) {
  const { completion, visible, dismiss } = useAccountSetupPrompt();
  if (!visible || !completion) return null;
  const message = accountSetupPromptMessage(completion);
  const fraction = completion.completedCount / completion.total;

  return (
    <section
      aria-label="Account setup"
      className={`rounded-xl border border-border bg-card p-4 shadow-sm ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
          <UserRoundCheck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-card-foreground">
            {message.title}
          </h2>
          <p className="text-sm text-muted-foreground">{message.body}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now — hide this reminder"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 space-y-1">
        <Progress
          value={fraction * 100}
          aria-label={`${completion.completedCount} of ${completion.total} steps done`}
        />
        <p className="text-xs text-muted-foreground">
          {completion.completedCount} of {completion.total} steps done
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <Button asChild size="sm">
          <Link href="/settings/account-setup">Continue setup</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </section>
  );
}
