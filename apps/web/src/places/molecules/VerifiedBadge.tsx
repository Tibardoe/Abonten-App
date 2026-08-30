import { IoCheckmarkCircle } from "react-icons/io5";

type VerifiedBadgeProps = {
  className?: string;
};

// Verified-place indicator (Places Phase 2, Milestone 2) -- render only
// when place.verified is true (set exclusively by approve_place_claim, see
// the migration). Mirrors PlaceOpenStatusBadge.tsx's badge shape, but here
// the checkmark icon + text label together carry the meaning, since
// "verified" has no open/closed-style two-state color pairing to reuse --
// same "never rely on color alone" reasoning as that template.
export default function VerifiedBadge({ className }: VerifiedBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-medium text-primary ${className ?? ""}`}
    >
      <IoCheckmarkCircle aria-hidden className="text-base" />
      Verified
    </span>
  );
}
