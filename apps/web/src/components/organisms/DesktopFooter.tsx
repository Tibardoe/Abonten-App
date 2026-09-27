import { SUPPORT_EMAIL, mailto } from "@abonten/core/brand/contacts";
import { LEGAL_ENTITY_NAME } from "@abonten/core/brand/legalEntity";
import { HELP_PATH, LEGAL_PATHS } from "@abonten/core/brand/socialLinks";
import Image from "next/image";
import Link from "next/link";
import SocialLinks from "../molecules/SocialLinks";

// The wide-screen footer: brand, where to go, help for organizers and
// place owners, and the legal pages. No sign-off line here — the footer
// sits under legal and support pages, where the brand sign-off never goes.

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Discover",
    links: [
      { label: "Explore", href: "/explore" },
      { label: "Abonten Weekly", href: "/weekly" },
      { label: "Spotlight", href: "/spotlight" },
      { label: "Search", href: "/search" },
    ],
  },
  {
    title: "Host on Abonten",
    links: [
      {
        label: "Create an event",
        href: "/help/organizers/creating-and-publishing-events",
      },
      {
        label: "Sell tickets",
        href: "/help/organizers/selling-tickets-and-promo-codes",
      },
      {
        label: "List your place",
        href: "/help/place-owners/managing-your-place",
      },
      {
        label: "Get verified",
        href: "/help/organizers/getting-verified",
      },
    ],
  },
  {
    title: "Help and legal",
    links: [
      { label: "Help centre", href: HELP_PATH },
      { label: "Terms & Conditions", href: LEGAL_PATHS.terms },
      { label: "Privacy", href: LEGAL_PATHS.privacy },
      { label: "Cookies", href: LEGAL_PATHS.cookies },
      { label: "Security", href: LEGAL_PATHS.security },
    ],
  },
];

export default function DesktopFooter() {
  return (
    <footer className="hidden lg:block mt-16 border-t border-border bg-sidebar text-sidebar-foreground">
      <div className="mx-auto grid w-[95%] grid-cols-[1.4fr_1fr_1fr_1fr] gap-10 py-12">
        <div className="flex flex-col gap-4">
          <Image
            src="/assets/images/brand/abonten-logotype-light.svg"
            alt="Abonten"
            width={150}
            height={28}
            className="h-7 w-auto self-start dark:hidden"
          />
          <Image
            src="/assets/images/brand/abonten-logotype-night.svg"
            alt="Abonten"
            width={150}
            height={28}
            className="hidden h-7 w-auto self-start dark:block"
          />
          <p className="max-w-xs text-sm text-muted-foreground">
            Connecting people to experiences: events, places and tickets, all in
            one place.
          </p>
          <SocialLinks />
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="mb-3 text-sm font-semibold">{column.title}</h2>
            <ul className="flex flex-col gap-2.5 text-sm text-muted-foreground">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex w-[95%] items-center justify-between gap-4 py-5 text-sm text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {LEGAL_ENTITY_NAME}
          </p>
          <a
            href={mailto(SUPPORT_EMAIL)}
            className="transition-colors hover:text-foreground"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
