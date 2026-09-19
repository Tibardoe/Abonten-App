import { cn } from "@/components/lib/utils";

type MaskIconProps = {
  src: string;
  /** Accessible name. Pass "" for a decorative icon whose meaning is
   *  carried by the surrounding link or button; it is then hidden from
   *  assistive technology instead of announced as an unnamed image. */
  alt: string;
  className?: string;
};

// For static SVG assets in /public: an <img>-based icon can't pick up
// currentColor (the browser doesn't cascade CSS color into an externally
// referenced SVG resource), so hardcoded fills in those files stay fixed
// across theme changes. Painting the shape as a mask instead lets a
// background-color token drive the color like any other theme-aware icon,
// without needing to inline or duplicate the source SVG's path data.
export default function MaskIcon({ src, alt, className }: MaskIconProps) {
  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={cn("inline-block bg-muted-foreground", className)}
      style={{
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
