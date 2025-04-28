import { IoShareSocialOutline } from "react-icons/io5";

export default function ShareButton() {
  return (
    <button type="button" className="flex items-center gap-1 p-1">
      <IoShareSocialOutline className="text-xl" />
      Share Event
    </button>
  );
}
