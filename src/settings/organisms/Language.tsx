"use client";

import { setUserLocale } from "@/actions/setUserLocale";
import Notification from "@/components/atoms/Notification";
import { languages } from "@/data/languages";
import type { Locale } from "@/i18n/config";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type LanguageProps = {
  currentLocale: Locale;
};

export default function Language({ currentLocale }: LanguageProps) {
  const t = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  // Selected instantly on click rather than waiting on the server round-trip,
  // so the radio reflects the choice immediately; rolled back on failure.
  const [selectedLocale, setSelectedLocale] = useState<Locale>(currentLocale);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSelect = (code: Locale) => {
    if (code === selectedLocale || isPending) return;

    const previousLocale = selectedLocale;
    setSelectedLocale(code);
    setError(null);

    startTransition(async () => {
      const response = await setUserLocale(code);

      if (response.status !== 200) {
        setSelectedLocale(previousLocale);
        setError(t("errors.generic"));
        return;
      }

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

      <Notification notification={error} />
    </>
  );
}
