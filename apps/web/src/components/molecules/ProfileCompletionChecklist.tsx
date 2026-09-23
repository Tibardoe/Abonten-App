"use client";

import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import Link from "next/link";
import { IoEllipseOutline } from "react-icons/io5";

// Shown above the Edit Profile fields while a profile step (name, a chosen
// username, a photo) is still missing — all three are done on this page, so
// the rows aren't links. The sign-in steps (email, phone) are on Account
// setup, linked underneath. Gone once the profile steps are done.
export default function ProfileCompletionChecklist() {
  const { data: completion } = useProfileCompletion();
  if (!completion) return null;

  const missing = completion.items.filter(
    (i) => i.group === "profile" && !i.complete,
  );
  if (missing.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-muted p-4 space-y-3">
      <h2 className="font-semibold">Finish your profile</h2>
      <ul className="space-y-2">
        {missing.map((item) => (
          <li key={item.key} className="flex gap-2">
            <IoEllipseOutline
              className="mt-0.5 shrink-0 text-lg text-muted-foreground"
              aria-hidden
            />
            <span>
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block text-xs text-muted-foreground">
                {item.description}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/settings/account-setup"
        className="inline-block text-sm font-medium text-primary hover:underline"
      >
        See all account setup steps ({completion.completedCount} of{" "}
        {completion.total} done)
      </Link>
    </div>
  );
}
