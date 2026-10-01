"use client";

import { useToast } from "@/hooks/useToast";
import { useLocaleSwitcher } from "@/i18n/LocaleProvider";
import { type Locale, localeNames, locales } from "@/i18n/config";
import { useTranslations } from "next-intl";
import { useState } from "react";

// The language picker. Each language is written in itself (a person who
// cannot read the current language must still find their own), the choice
// is saved in the preference cookie, and the page re-renders in the new
// language straight away — every string, including this list's title.
export default function Language() {
  const t = useTranslations("common");
  const { locale, setLocale, isPending } = useLocaleSwitcher();
  const toast = useToast();
  // Selected the moment it is clicked, so the radio does not wait for the
  // server round-trip; the provider's locale catches up when the page has
  // re-rendered in the new language.
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);

  const handleSelect = async (code: Locale) => {
    if (code === selectedLocale || isPending) return;
    const previous = selectedLocale;
    setSelectedLocale(code);
    try {
      await setLocale(code);
    } catch {
      setSelectedLocale(previous);
      toast.error(t("errors.generic"));
    }
  };

  return (
    <ul className="flex flex-col space-y-5 mb-5" aria-busy={isPending}>
      {locales.map((code) => (
        <li key={code}>
          <button
            type="button"
            lang={code}
            disabled={isPending}
            onClick={() => handleSelect(code)}
            className="flex items-center justify-between w-full md:text-lg disabled:opacity-50"
          >
            <span>{localeNames[code]}</span>

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
  );
}
