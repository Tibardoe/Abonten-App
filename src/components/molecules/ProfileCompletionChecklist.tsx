"use client";

import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import Link from "next/link";
import { IoCheckmarkCircle } from "react-icons/io5";

// The full 4-item checklist (Part 15/18), shown on the Edit Profile page
// above the editable fields. Disappears once every item is complete.
export default function ProfileCompletionChecklist() {
  const { data: completion } = useProfileCompletion();

  if (!completion || completion.isComplete) return null;

  return (
    <div className="rounded-xl border border-border bg-muted p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Complete your profile</h2>
        <span className="text-sm text-muted-foreground">
          {completion.completedCount}/{completion.total}
        </span>
      </div>

      <ul className="space-y-2">
        {completion.items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <IoCheckmarkCircle
                className={`text-lg shrink-0 ${
                  item.complete ? "text-mint" : "text-border"
                }`}
                aria-hidden
              />
              <span
                className={
                  item.complete ? "text-muted-foreground line-through" : ""
                }
              >
                {item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
