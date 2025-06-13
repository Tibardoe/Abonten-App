import Link from "next/link";
import { MdOutlineSettings } from "react-icons/md";

export default function SettingsButton() {
  return (
    <Link href="/settings">
      <MdOutlineSettings className="text-3xl md:text-4xl" />
    </Link>
  );
}
