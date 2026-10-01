"use client";

import { signOut } from "@/services/authService";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function SignOutButton() {
  const t = useTranslations("auth");

  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        signOut();
      }}
      className="inline-block rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-60"
    >
      {pending ? t("signingOut") : t("signOut")}
    </button>
  );
}
