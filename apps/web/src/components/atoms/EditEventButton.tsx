"use client";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { MdOutlineEdit } from "react-icons/md";

type EventProp = {
  eventId: string;
  /** Renders as a DropdownMenuItem (event card menu) instead of a plain button. */
  asMenuItem?: boolean;
};

// Takes the organizer straight into the Details tab of the Unified Event
// Management page instead of opening the old EditEventModal (retired — see
// that file's git history) — Part 9 of the spec: one editing experience,
// not two competing ones.
export default function EditEventButton({ eventId, asMenuItem }: EventProp) {
  const t = useTranslations("common");

  const router = useRouter();
  const onClick = () => router.push(`/manage/events/${eventId}`);

  if (asMenuItem) {
    return (
      <DropdownMenuItem onSelect={onClick} className="gap-2">
        <MdOutlineEdit className="text-xl" />
        {t("editEvent")}
      </DropdownMenuItem>
    );
  }

  return (
    <button
      type="button"
      className="flex items-center gap-1 p-1"
      onClick={onClick}
    >
      <MdOutlineEdit className="text-xl" />
      {t("editEvent")}
    </button>
  );
}
