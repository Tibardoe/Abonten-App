"use client";

import { setUserLocale } from "@/actions/setUserLocale";
import { languages } from "@/data/languages";
import { useToast } from "@/hooks/useToast";
import { useLocaleSwitcher } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n/config";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type LanguageProps = {
  currentLocale: Locale;
};

export default function Language({ currentLocale }: LanguageProps) {
  const t = useTranslations("common");
  const { setLocale } = useLocaleSwitcher();
  const [isPending, startTransition] = useTransition();
  // Selected instantly on click rather than waiting on the server round-trip,
  // so the radio reflects the choice immediately; rolled back on failure.
  const [selectedLocale, setSelectedLocale] = useState<Locale>(currentLocale);
  const toast = useToast();
  const router = useRouter();

  const handleSelect = (code: Locale) => {
    if (code === selectedLocale || isPending) return;

    const previousLocale = selectedLocale;
    setSelectedLocale(code);

    startTransition(async () => {
      const response = await setUserLocale(code);

      if (response.status !== 200) {
        setSelectedLocale(previousLocale);
        toast.error(t("errors.generic"));
        return;
      }

      // The root layout no longer re-reads the locale cookie per request
      // (see layout.tsx), so it won't pick up the change on its own —
      // apply it to the shared client provider directly. router.refresh()
      // still re-runs this route's own server-rendered translations
      // (e.g. this page's nav title, fetched via getTranslations()).
      await setLocale(code);
      router.refresh();
    });
  };

  return (
    <>
      <ul className="flex flex-col space-y-5 mb-5">
        {languages.map(({ code, name }) => (
          <li key={code}>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleSelect(code)}
              className="flex items-center justify-between w-full md:text-lg disabled:opacity-50"
            >
              <span>{name}</span>

              <input
                type="radio"
                name="language"
                value={code}
                checked={selectedLocale === code}
                readOnly
                className="accent-primary w-5 h-5"
              />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
