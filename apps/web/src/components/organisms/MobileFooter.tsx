import { SUPPORT_EMAIL, mailto } from "@abonten/core/brand/contacts";
import { HELP_PATH, LEGAL_PATHS } from "@abonten/core/brand/socialLinks";
import Link from "next/link";
import MaskIcon from "../atoms/MaskIcon";
import SocialLinks from "../molecules/SocialLinks";

export default function MobileFooter({
  onNavigate,
}: {
  /** Closes the menu sheet this footer sits in when a link is followed. */
  onNavigate?: () => void;
}) {
  return (
    // mt-auto pins this to the bottom of the sidebar's flex column; pt-10
    // separates it from the nav above without leaving a gap below it.
    <footer className="mt-auto flex w-full flex-col space-y-3 pt-10 text-sm text-muted-foreground">
      <nav aria-label="Legal and help" className="flex flex-col gap-3 px-3">
        <Link href={HELP_PATH} onClick={onNavigate}>
          Help
        </Link>

        <Link href={LEGAL_PATHS.terms} onClick={onNavigate}>
          Terms &amp; Conditions
        </Link>

        <Link href={LEGAL_PATHS.privacy} onClick={onNavigate}>
          Privacy
        </Link>

        <Link href={LEGAL_PATHS.cookies} onClick={onNavigate}>
          Cookies
        </Link>

        <Link href={LEGAL_PATHS.security} onClick={onNavigate}>
          Security
        </Link>

        <a href={mailto(SUPPORT_EMAIL)}>Contact</a>
      </nav>

      <hr className="border-sidebar-border" />

      <SocialLinks className="self-center" />

      <div className="flex gap-2 px-3">
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
