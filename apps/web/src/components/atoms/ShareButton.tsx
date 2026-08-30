import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { handleShare } from "@/utils/handleShare";
import { IoShareSocialOutline } from "react-icons/io5";

type ShareBtnProps = {
  title: string;
  url: string;
  /** Renders as a DropdownMenuItem (event card menu) instead of a plain button. */
  asMenuItem?: boolean;
};

export default function ShareButton({ title, url, asMenuItem }: ShareBtnProps) {
  const onClick = () => handleShare({ title, url });

  if (asMenuItem) {
    return (
      <DropdownMenuItem onSelect={onClick} className="gap-2">
        <IoShareSocialOutline className="text-xl" />
        Share Event
      </DropdownMenuItem>
    );
  }

  return (
    <button
      onClick={onClick}
      type="button"
      className="flex items-center gap-1 p-1"
    >
      <IoShareSocialOutline className="text-xl" />
      Share Event
    </button>
  );
}
