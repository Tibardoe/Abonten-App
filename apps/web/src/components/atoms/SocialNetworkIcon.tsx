import { cn } from "@/components/lib/utils";
import type { SocialNetwork } from "@abonten/core/brand/socialLinks";
import MaskIcon from "./MaskIcon";

// The mark of one of Abonten's official networks, for the footers and the
// Follow Abonten block. The X icon reuses /assets/images/twitter.svg, whose
// path data is already the X mark; that file fills its whole box while the
// others leave a margin, so it is drawn smaller to look the same size.

const ICONS: Record<SocialNetwork, { src: string; md: string; sm: string }> = {
  x: {
    src: "/assets/images/twitter.svg",
    md: "w-[20px] h-[20px]",
    sm: "w-[13px] h-[13px]",
  },
  instagram: {
    src: "/assets/images/instagram.svg",
    md: "w-[30px] h-[30px]",
    sm: "w-[20px] h-[20px]",
  },
  tiktok: {
    src: "/assets/images/tiktok.svg",
    md: "w-[30px] h-[30px]",
    sm: "w-[20px] h-[20px]",
  },
  whatsapp: {
    src: "/assets/images/whatsapp.svg",
    md: "w-[30px] h-[30px]",
    sm: "w-[20px] h-[20px]",
  },
};

/** Decorative: the link around it carries the name. */
export default function SocialNetworkIcon({
  network,
  size = "md",
  className,
}: {
  network: SocialNetwork;
  /** md: the footers' icon-only row; sm: beside the network's name. */
  size?: "md" | "sm";
  className?: string;
}) {
  const icon = ICONS[network];
  return (
    <MaskIcon src={icon.src} alt="" className={cn(icon[size], className)} />
  );
}
