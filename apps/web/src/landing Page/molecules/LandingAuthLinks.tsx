"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

// Client component so this can read the locale from the shared
// NextIntlClientProvider instead of next-intl/server's getTranslations(),
// which reads the locale cookie and would force the whole landing page
// dynamic. See src/i18n/LocaleProvider.tsx.
export default function LandingAuthLinks() {
  const t = useTranslations("navigation");

  return (
    <div className="space-x-3">
      <Link
        href="/auth/signin"
        className="bg-transparent rounded-md font-bold hover:bg-mint border border-mint p-2 text-sm"
      >
        {t("signUp")}
      </Link>
      <Link
        href="/auth/signin"
        className="bg-transparent rounded-md font-bold hover:bg-mint border border-mint p-2 text-sm"
      >
        {t("signIn")}
      </Link>
    </div>
  );
}
