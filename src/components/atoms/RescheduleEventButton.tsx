import { MdOutlineChangeCircle } from "react-icons/md";

export default function RescheduleEventButton() {
  return (
    <button type="button" className="flex items-center gap-1 p-1">
      <MdOutlineChangeCircle className="text-xl" />
      Reschedule Event
    </button>
  );
}
