"use client";

import type { TeamRoleCode } from "@abonten/types/teamType";
import { useTranslations } from "next-intl";

/** A role's name, as a small label. The code decides, the catalog words it. */
export default function TeamRoleChip({ role }: { role: TeamRoleCode }) {
  const t = useTranslations("teams");
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
      {t("role", { role })}
    </span>
  );
}
