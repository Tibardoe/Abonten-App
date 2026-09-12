import { HELP_PATH, LEGAL_PATHS } from "@abonten/core/brand/socialLinks";
import Link from "next/link";
import MaskIcon from "../atoms/MaskIcon";
import SocialLinks from "../molecules/SocialLinks";

export default function MobileFooter() {
  return (
    // mt-auto pins this to the bottom of the sidebar's flex column; pt-10
    // separates it from the nav above without leaving a gap below it.
    <footer className="mt-auto flex w-full flex-col space-y-3 pt-10">
      <nav aria-label="Legal and help" className="flex flex-col gap-3 pl-[5%]">
        <Link href={LEGAL_PATHS.terms}>Terms &amp; Conditions</Link>

        <Link href={LEGAL_PATHS.privacy}>Privacy</Link>

        <Link href={LEGAL_PATHS.cookies}>Cookies</Link>

        <Link href={LEGAL_PATHS.security}>Security</Link>

        <Link href={HELP_PATH}>Help</Link>
      </nav>

      <hr />

      <SocialLinks className="self-center" />

      <div className="flex gap-2 pl-[5%]">
        <MaskIcon
          src="/assets/images/copyright.svg"
          alt="Copyright"
          className="w-5 h-5"
        />
        <p>{new Date().getFullYear()} Abonten Hub</p>
      </div>
    </footer>
  );
}
