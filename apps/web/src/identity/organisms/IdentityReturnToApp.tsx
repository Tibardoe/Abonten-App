"use client";

import { Button } from "@/components/ui/button";
import { SupportingText } from "@/components/ui/typography";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Hands the person back to the app once, on arrival. The app's browser
// session closes when it sees this address; if the browser refuses to open
// the app without a tap, the button does it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function IdentityReturnToApp() {
  const t = useTranslations("identity");
  const params = useSearchParams();
  const id = params.get("v") ?? "";
  const appUrl = UUID.test(id)
    ? `abonten://settings/identity?checked=${id}`
    : "abonten://settings/identity";

  useEffect(() => {
    window.location.replace(appUrl);
  }, [appUrl]);

  return (
    <div className="flex max-w-md flex-col gap-4">
      <SupportingText>{t("doneBody")}</SupportingText>
      <Button asChild>
        <a href={appUrl}>{t("openApp")}</a>
      </Button>
    </div>
  );
}
