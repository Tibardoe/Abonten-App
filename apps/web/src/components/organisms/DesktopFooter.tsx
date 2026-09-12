import { SUPPORT_EMAIL, mailto } from "@abonten/core/brand/contacts";
import { HELP_PATH, LEGAL_PATHS } from "@abonten/core/brand/socialLinks";
import Link from "next/link";
import MaskIcon from "../atoms/MaskIcon";
import SocialLinks from "../molecules/SocialLinks";

export default function DesktopFooter() {
  return (
    <footer className="hidden md:flex w-[80%] mx-auto gap-5 flex-col mb-5">
      <SocialLinks large />

      <hr />

      <div className="flex justify-between">
        <div className="flex gap-2">
          <MaskIcon
            src="/assets/images/copyright.svg"
            alt="Copyright"
            className="w-5 h-5"
          />
          <p>{new Date().getFullYear()} Abonten Hub</p>
        </div>

        <nav aria-label="Legal and help" className="space-x-5">
          <Link href={LEGAL_PATHS.terms}>Terms &amp; Conditions</Link>

          <Link href={LEGAL_PATHS.privacy}>Privacy</Link>

          <Link href={LEGAL_PATHS.cookies}>Cookies</Link>

          <Link href={LEGAL_PATHS.security}>Security</Link>

          <Link href={HELP_PATH}>Help</Link>

          <a href={mailto(SUPPORT_EMAIL)}>Contact</a>
        </nav>
      </div>
    </footer>
  );
}
