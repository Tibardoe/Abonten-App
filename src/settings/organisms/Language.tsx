"use client";

import { setUserLocale } from "@/actions/setUserLocale";
import { languages } from "@/data/languages";
import type { Locale } from "@/i18n/config";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type LanguageProps = {
  currentLocale: Locale;
};

export default function Language({ currentLocale }: LanguageProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSelect = (code: Locale) => {
    if (code === currentLocale || isPending) return;

    startTransition(async () => {
      await setUserLocale(code);
      router.refresh();
    });
  };

  return (
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
              checked={currentLocale === code}
              readOnly
              className="accent-green-500 w-5 h-5"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
