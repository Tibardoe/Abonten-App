import { handleShare } from "@/utils/handleShare";
import { IoShareSocialOutline } from "react-icons/io5";

type ShareBtnProps = {
  title: string;
  url: string;
};

export default function ShareButton({ title, url }: ShareBtnProps) {
  return (
    <button
      onClick={() => handleShare({ title, url })}
      type="button"
      className="flex items-center gap-1 p-1"
    >
      <IoShareSocialOutline className="text-xl" />
      Share Event
    </button>
  );
}
