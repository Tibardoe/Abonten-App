import Image from "next/image";
import Link from "next/link";

export default function SettingsButton() {
  return (
    <Link href="/settings">
      <Image
        className="w-7 h-7 md:w-8 md:h-8 lg:w-10 lg:h-10"
        src="/assets/images/settings.svg"
        alt="Settings icon"
        width={40}
        height={40}
      />
    </Link>
  );
}
