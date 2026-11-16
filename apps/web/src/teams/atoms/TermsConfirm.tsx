"use client";

import type { TeamTerms } from "@abonten/types/teamType";
import { useTranslations } from "next-intl";

/**
 * N4: once Abonten publishes team terms, whoever makes a team (or makes
 * their account a team) accepts them for it and says they may act for it.
 * The server refuses without the version shown here.
 */
export default function TermsConfirm({
  terms,
  checked,
  onChange,
  id = "team-terms",
}: {
  terms: TeamTerms;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
}) {
  const t = useTranslations("teams");
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4"
      />
      <span>
        {t.rich("termsConfirm", {
          terms: (chunks) => (
            <a
              href={terms.path}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline"
            >
              {chunks}
            </a>
          ),
        })}
      </span>
    </label>
  );
}
