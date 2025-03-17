import { cn } from "@/components/lib/utils";
import Image from "next/image";

type TabsNavButtonProp = {
  imgUrl: string;
  text: string;
  isActive: boolean;
  onClick: () => void;
};

export default function UserAccountTabsNavButton({
  imgUrl,
  text,
  isActive,
  onClick,
}: TabsNavButtonProp) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex gap-3 items-center p-3",
        isActive ? "border-t-2 border-black font-bold" : "border-transparent",
      )}
    >
      <Image src={imgUrl} alt="text" height={30} width={30} />
      <p className="md:text-md lg:text-lg">{text}</p>
    </button>
  );
}
