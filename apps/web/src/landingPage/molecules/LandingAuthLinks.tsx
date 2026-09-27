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
    <div className="flex items-center gap-2">
      <Link
        href="/auth/signin"
        className="hidden h-10 items-center rounded-full px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:inline-flex"
      >
        {t("signIn")}
      </Link>
      <Link
        href="/auth/signin"
        className="inline-flex h-10 items-center rounded-full bg-mint px-5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-mint/90"
      >
        {t("signUp")}
      </Link>
    </div>
  );
}
