import { SOCIAL_LINKS } from "@abonten/core/brand/socialLinks";
import MaskIcon from "../atoms/MaskIcon";

// The official Abonten accounts, in one place for both footers. URLs come
// from @abonten/core/brand/socialLinks (shared with the mobile drawer). The
// X icon reuses the existing /assets/images/twitter.svg, whose path data is
// already the X mark.

const ICONS: Record<
  (typeof SOCIAL_LINKS)[number]["key"],
  { src: string; className: string }
> = {
  x: { src: "/assets/images/twitter.svg", className: "w-[20px] h-[20px]" },
  instagram: {
    src: "/assets/images/instagram.svg",
    className: "w-[30px] h-[30px]",
  },
  tiktok: { src: "/assets/images/tiktok.svg", className: "w-[30px] h-[30px]" },
};

export default function SocialLinks({
  className = "",
  large = false,
}: {
  className?: string;
  large?: boolean;
}) {
  return (
    <nav aria-label="Abonten on social media" className={className}>
      <ul className="flex items-center gap-3">
        {SOCIAL_LINKS.map((link) => {
          const icon = ICONS[link.key];
          return (
            <li key={link.key}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abonten on ${link.label}`}
                className="inline-flex hover:opacity-80"
              >
                <MaskIcon
                  src={icon.src}
                  alt=""
                  className={`${icon.className} ${large ? "lg:scale-125" : ""}`}
                />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
