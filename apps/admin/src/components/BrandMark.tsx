// The Abonten mark (Small weight, drawn for 25-63 px), inline so it takes
// the console's text colour and the theme's mint. Source:
// apps/web/public/assets/images/brand/abonten-mark-small-light.svg.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="100 90 800 800" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M 500 90 L 100 890 L 263.23047 890 L 500 416.4707 L 518.37695 453.22266 C 556.51925 421.10358 595.20576 389.65342 634.43555 358.87109 L 500 90 z M 683.28125 456.56055 C 646.53196 492.34604 610.23067 528.56742 574.37891 565.22461 L 736.76953 890 L 900 890 L 683.28125 456.56055 z"
      />
      <path
        className="fill-mintDeep dark:fill-mint"
        d="M410.23 596.00 Q591.45 430.36 790.34 286.44 L772.45 322.21 Q527.79 548.91 308.23 800.00 Z"
      />
    </svg>
  );
}
