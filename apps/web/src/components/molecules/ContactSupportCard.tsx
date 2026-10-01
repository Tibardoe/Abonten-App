"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOpenConversation } from "@/messaging/hooks/useOpenConversation";
import { SUPPORT_EMAIL, mailto } from "@abonten/core/brand/contacts";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "../ui/button";

// "Still stuck?" card on the help centre. Abonten's primary support channel
// is the in-app support conversation (the same thread the mobile app's
// "Help & support" opens), handled from the admin console's Support queue.
// Signed-out visitors are sent to sign in first and come back to the help
// centre afterwards; the official support mailbox is offered as the fallback
// for anyone who cannot sign in.
export default function ContactSupportCard() {
  const t = useTranslations("common");

  const { data: user } = useCurrentUser();
  const openSupport = useOpenConversation();

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{t("stillNeedHelp")}</p>
        <p className="text-sm text-muted-foreground">
          {t("messageAbontenSupportFromYourInbox")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("canTSignInEmail")}
          <a
            href={mailto(SUPPORT_EMAIL)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
      {user ? (
        <Button
          type="button"
          disabled={openSupport.isPending}
          onClick={() => openSupport.mutate({ type: "support" })}
        >
          {openSupport.isPending ? t("opening") : t("contactSupport")}
        </Button>
      ) : (
        <Button asChild>
          <Link href={getSignInUrl("/help")}>
            {t("signInToContactSupport")}
          </Link>
        </Button>
      )}
    </div>
  );
}
