import { MdOutlineCancel } from "react-icons/md";

export default function CancelButton() {
  return (
    <button type="button" className="flex items-center gap-1 p-1 text-red-800">
      <MdOutlineCancel className="text-xl " />
      Cancel Event
    </button>
  );
}
