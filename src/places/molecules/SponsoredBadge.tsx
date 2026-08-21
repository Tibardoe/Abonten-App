type SponsoredBadgeProps = {
  className?: string;
};

// Ad-disclosure label for a Featured Places card (Places Phase 2,
// Milestone 5, paid promotion). Deliberately a plain neutral pill -- never
// primary/mint (VerifiedBadge.tsx) or the rating stars' color -- so it can
// never be mistaken for a quality signal ("highest rated"/"most popular").
// It only ever means "this placement was paid for".
export default function SponsoredBadge({ className }: SponsoredBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-foreground/80 px-2.5 py-1 text-xs font-medium text-background backdrop-blur-sm ${className ?? ""}`}
    >
      Sponsored
    </span>
  );
}
