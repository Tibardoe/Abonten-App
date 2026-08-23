"use client";

import { useRouter } from "next/navigation";
import { MdOutlineEdit } from "react-icons/md";

type EventProp = {
  eventId: string;
};

// Takes the organizer straight into the Details tab of the Unified Event
// Management page instead of opening the old EditEventModal (retired — see
// that file's git history) — Part 9 of the spec: one editing experience,
// not two competing ones.
export default function EditEventButton({ eventId }: EventProp) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="flex items-center gap-1 p-1"
      onClick={() => router.push(`/manage/events/${eventId}`)}
    >
      <MdOutlineEdit className="text-xl" />
      Edit Event
    </button>
  );
}
