"use client";

import { useTranslations } from "next-intl";

/**
 * K7: whoever makes or joins a team says they are 18 or older (the server
 * refuses without it, and refuses a person an ID check found under 18).
 */
export default function AdultConfirm({
  checked,
  onChange,
  id = "team-adult",
}: {
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
      <span>{t("adultConfirm")}</span>
    </label>
  );
}
