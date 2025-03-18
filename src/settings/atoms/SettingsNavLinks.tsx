"use client";
import { useSettingsTab } from "@/context/settingsContext";
import Image from "next/image";
import Link from "next/link";

type SettingsNavLinkProps = {
  text: string;
  imgUrl: string;
  arrowUrl: string;
};

export default function SettingsNavLinks({
  text,
  imgUrl,
  arrowUrl,
}: SettingsNavLinkProps) {
  const { setSettingsActiveTab } = useSettingsTab();

  const route = text.toLowerCase();
  return (
    <div className="flex w-full justify-between items-center">
      <button type="button" className="gap-3 items-center flex lg:hidden">
        <Image
          src={imgUrl}
          alt={`${text} icon`}
          width={40}
          height={40}
          className="w-8 h-8 md:w-10 md:h-10"
        />
        <p className="text-lg">{text}</p>
      </button>

      <button
        type="button"
        className="gap-3 items-center hidden lg:flex"
        onClick={() => setSettingsActiveTab(route)}
      >
        <Image
          src={imgUrl}
          alt={`${text} icon`}
          width={40}
          height={40}
          className="w-8 h-8 md:w-10 md:h-10"
        />
        <p className="text-lg">{text}</p>
      </button>

      <Link href={`/${route}`} className="flex lg:hidden">
        <Image src={arrowUrl} alt={`${text} icon`} width={30} height={30} />
      </Link>
    </div>
  );
}
