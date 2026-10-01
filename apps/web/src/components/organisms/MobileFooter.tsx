import { SUPPORT_EMAIL, mailto } from "@abonten/core/brand/contacts";
import { HELP_PATH, LEGAL_PATHS } from "@abonten/core/brand/socialLinks";
import { useTranslations } from "next-intl";
import Link from "next/link";
import MaskIcon from "../atoms/MaskIcon";
import SocialLinks from "../molecules/SocialLinks";

export default function MobileFooter({
  onNavigate,
}: {
  /** Closes the menu sheet this footer sits in when a link is followed. */
  onNavigate?: () => void;
}) {
  const t = useTranslations("common");

  return (
    // mt-auto pins this to the bottom of the sidebar's flex column; pt-10
    // separates it from the nav above without leaving a gap below it.
    <footer className="mt-auto flex w-full flex-col space-y-3 pt-10 text-sm text-muted-foreground">
      <nav aria-label={t("legalAndHelp")} className="flex flex-col gap-3 px-3">
        <Link href={HELP_PATH} onClick={onNavigate}>
          {t("help")}
        </Link>

        <Link href={LEGAL_PATHS.terms} onClick={onNavigate}>
          {t("termsConditions")}
        </Link>

        <Link href={LEGAL_PATHS.privacy} onClick={onNavigate}>
          {t("privacy")}
        </Link>

        <Link href={LEGAL_PATHS.cookies} onClick={onNavigate}>
          {t("cookies")}
        </Link>

        <Link href={LEGAL_PATHS.security} onClick={onNavigate}>
          {t("security")}
        </Link>

        <a href={mailto(SUPPORT_EMAIL)}>{t("contact")}</a>
      </nav>

      <hr className="border-sidebar-border" />

      <SocialLinks className="self-center" />

      <div className="flex gap-2 px-3">
        <MaskIcon
          src="/assets/images/copyright.svg"
          alt={t("copyright")}
          className="w-5 h-5"
        />
        <p>{t("abontenHub", { getFullYear: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
