"use client";

import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { profileCompletionItemCopy } from "@abonten/core/profileCompletion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { IoEllipseOutline } from "react-icons/io5";

// Shown above the Edit Profile fields while a profile step (name, a chosen
// username, a photo) is still missing — all three are done on this page, so
// the rows aren't links. The sign-in steps (email, phone) are on Account
// setup, linked underneath. Gone once the profile steps are done.
export default function ProfileCompletionChecklist() {
  const t = useTranslations("common");
  const tc = useTranslations("core");

  const { data: completion } = useProfileCompletion();
  if (!completion) return null;

  const missing = completion.items.filter(
    (i) => i.group === "profile" && !i.complete,
  );
  if (missing.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-muted p-4 space-y-3">
      <h2 className="font-semibold">{t("finishYourProfile")}</h2>
      <ul className="space-y-2">
        {missing.map((item) => {
          const copy = profileCompletionItemCopy(tc, item);
          return (
            <li key={item.key} className="flex gap-2">
              <IoEllipseOutline
                className="mt-0.5 shrink-0 text-lg text-muted-foreground"
                aria-hidden
              />
              <span>
                <span className="block text-sm font-medium">{copy.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {copy.description}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <Link
        href="/settings/account-setup"
        className="inline-block text-sm font-medium text-primary hover:underline"
      >
        {t("seeAllAccountSetupStepsOf", {
          completedCount: completion.completedCount,
          total: completion.total,
        })}
      </Link>
    </div>
  );
}
