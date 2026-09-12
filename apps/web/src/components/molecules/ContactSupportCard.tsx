"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOpenConversation } from "@/messaging/hooks/useOpenConversation";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import Link from "next/link";
import { Button } from "../ui/button";

// "Still stuck?" card on the help centre. Abonten's support channel is the
// in-app support conversation (the same thread the mobile app's "Help &
// support" opens), handled from the admin console's Support queue — there is
// no public support email address. Signed-out visitors are sent to sign in
// first and come back to the help centre afterwards.
export default function ContactSupportCard() {
  const { data: user } = useCurrentUser();
  const openSupport = useOpenConversation();

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="font-semibold">Still need help?</p>
        <p className="text-sm text-muted-foreground">
          Message Abonten Support from your inbox. Replies arrive as messages
          and notifications.
        </p>
      </div>
      {user ? (
        <Button
          type="button"
          disabled={openSupport.isPending}
          onClick={() => openSupport.mutate({ type: "support" })}
        >
          {openSupport.isPending ? "Opening…" : "Contact support"}
        </Button>
      ) : (
        <Button asChild>
          <Link href={getSignInUrl("/help")}>Sign in to contact support</Link>
        </Button>
      )}
    </div>
  );
}
