import { cn } from "@/components/lib/utils";
import { SOCIAL_LINKS } from "@abonten/core/brand/socialLinks";
import { ROUNDUP_CITY } from "@abonten/core/social/roundups";
import { useTranslations } from "next-intl";
import SocialNetworkIcon from "../atoms/SocialNetworkIcon";

// "Follow Abonten for what's on in Accra": Abonten's own channels, offered
// after a purchase or a registration and at the end of Abonten Weekly. It
// always comes after the page's main content (a ticket, an edition), never
// in its way. Nothing in it is personal, so it is safe on cached pages.
// The city is the one the channels' roundups cover (ROUNDUP_CITY).
export default function FollowAbonten({ className }: { className?: string }) {
  const t = useTranslations("common");
  const title = t("followAbonten.title", { city: ROUNDUP_CITY.name });

  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-2xl border border-border bg-card px-5 py-4 text-left",
        className,
      )}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("followAbonten.body")}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {SOCIAL_LINKS.map((link) => (
          <li key={link.key}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t(`abontenOnNetwork.${link.key}`)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SocialNetworkIcon
                network={link.key}
                size="sm"
                className="bg-foreground"
              />
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
