"use client";

import signOutOtherDevices from "@/actions/signOutOtherDevices";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { currentWebPushEndpoint } from "@/hooks/useWebPush";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "../ui/button";

// Settings › Security. Signing out is per device, so this is how someone
// ends the session on a phone they lost or sold. This browser stays signed
// in and keeps its notifications.
export default function SignOutOtherDevices() {
  const t = useTranslations("settings");
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    const confirmed = await confirm({
      title: t("signOutOfEveryOtherDevice"),
      message: t("signOutOtherDevicesBody"),
      confirmLabel: t("signOutOthers"),
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      const keepWebPushEndpoint = await currentWebPushEndpoint();
      const response = await signOutOtherDevices({ keepWebPushEndpoint }).catch(
        actionUnreachable,
      );
      if (response.status === 200) {
        toast.success(t("yourOtherDevicesAreSignedOut"));
      } else {
        toast.error(response.message ?? t("couldnTSignOutYourOtherDevices"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground p-4 md:p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <span className="font-medium md:text-lg">
          {t("signOutOfOtherDevices")}
        </span>
        <p className="text-sm text-muted-foreground">
          {t("signOutOtherDevicesBody")}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="shrink-0 self-start md:self-center"
        disabled={busy}
        onClick={handleClick}
      >
        {busy ? t("signingOut") : t("signOutOfOtherDevices")}
      </Button>
    </div>
  );
}
