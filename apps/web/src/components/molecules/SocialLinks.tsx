import { SOCIAL_LINKS } from "@abonten/core/brand/socialLinks";
import { useTranslations } from "next-intl";
import SocialNetworkIcon from "../atoms/SocialNetworkIcon";

// The official Abonten accounts, in one place for both footers. URLs come
// from @abonten/core/brand/socialLinks (shared with the mobile drawer and
// the Follow Abonten block).

export default function SocialLinks({
  className = "",
  large = false,
}: {
  className?: string;
  large?: boolean;
}) {
  const t = useTranslations("common");

  return (
    <nav aria-label={t("abontenOnSocialMedia")} className={className}>
      <ul className="flex items-center gap-3">
        {SOCIAL_LINKS.map((link) => (
          <li key={link.key}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t(`abontenOnNetwork.${link.key}`)}
              className="inline-flex hover:opacity-80"
            >
              <SocialNetworkIcon
                network={link.key}
                className={large ? "lg:scale-125" : undefined}
              />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
