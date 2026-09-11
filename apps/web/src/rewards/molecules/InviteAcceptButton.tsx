"use client";

import { bindReferralCode } from "@/actions/bindReferralCode";
import { Button } from "@/components/ui/button";
import { bindResultMessage } from "@abonten/core/rewards/invite";
import Link from "next/link";
import { useState } from "react";

// The invite page for someone already signed in: applying the invite is one
// tap (the server decides whether this account can still use one).
export default function InviteAcceptButton({ code }: { code: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "info" | "error";
    text: string;
  } | null>(null);

  const accept = async () => {
    setPending(true);
    try {
      const res = await bindReferralCode({ code });
      setMessage(
        res.data
          ? bindResultMessage(res.data)
          : { tone: "error", text: "Sign in first, then open the link again." },
      );
    } catch {
      setMessage({
        tone: "error",
        text: "We couldn't apply the invite. Please try again.",
      });
    } finally {
      setPending(false);
    }
  };

  if (message) {
    return (
      <div className="flex w-full flex-col gap-3">
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
        <Button asChild variant="outline" className="w-full">
          <Link href="/rewards">Go to Rewards</Link>
        </Button>
      </div>
    );
  }

  return (
    <Button size="lg" className="w-full" disabled={pending} onClick={accept}>
      {pending ? "Applying…" : "Use this invite"}
    </Button>
  );
}
