import { MdDeleteOutline } from "react-icons/md";

export default function DeleteEventButton() {
  return (
    <button type="button" className="flex items-center gap-1 p-1 text-red-800">
      <MdDeleteOutline className="text-xl" />
      Delete Event
    </button>
  );
}
