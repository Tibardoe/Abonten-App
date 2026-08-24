"use client";

import { cn } from "@/components/lib/utils";
import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";
import { ChevronUp } from "lucide-react";

type CollapsiblePaymentPanelProps = {
  isExpanded: boolean;
  onToggle: () => void;
  toggleDisabled?: boolean;
  totalLabel: string;
  statusText: string;
  children: React.ReactNode;
};

/**
 * Mobile-only collapsible wrapper around the checkout payment controls
 * (wallet selection / pay button). Renders its `children` exactly once —
 * on mobile that single instance sits in a sticky bottom bar that can be
 * expanded/collapsed; on `md+` the same instance is shown inline, always
 * expanded, matching the previous desktop layout. Never mount `children`
 * twice (e.g. once per breakpoint), since PaymentMethodSelector owns live
 * queries/mutations that must not run in two places at once.
 *
 * This component only tracks UI (expanded/collapsed) state — it knows
 * nothing about wallets, checkout sessions, or payment status.
 *
 * The expand animation is a max-height transition (0 -> a fixed viewport
 * fraction) rather than the `grid-template-rows: 0fr -> 1fr` trick: `fr`
 * units aren't reliably animatable across browsers and were snapping
 * instantly instead of transitioning. max-height between two fixed lengths
 * animates consistently everywhere. The inner content additionally
 * fades/slides in underneath the header so it reads as "pulling up" rather
 * than just growing.
 *
 * The panel is `position: fixed` (not `sticky`) on mobile so its bottom
 * edge is always pinned to the viewport, at every scroll position — with
 * `sticky`, the panel only behaves like a pinned sheet once the page has
 * actually scrolled far enough to "stick"; before that it's a normal block,
 * so growing its height pushed its *bottom* further down the page instead
 * of pulling its top upward. `fixed` with only `bottom` set (no `top`)
 * guarantees height changes always grow the box upward from that anchored
 * bottom edge. The page reserves matching bottom padding (see
 * PendingCheckoutsBasket) so content never sits hidden underneath it.
 */
export default function CollapsiblePaymentPanel({
  isExpanded,
  onToggle,
  toggleDisabled,
  totalLabel,
  statusText,
  children,
}: CollapsiblePaymentPanelProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const duration = prefersReducedMotion ? "duration-0" : "duration-300";

  return (
    <div className="fixed inset-x-0 bottom-20 z-20 mx-auto w-[95%] md:static md:inset-auto md:bottom-auto md:z-auto md:mx-0 md:w-auto">
      <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-lg overflow-hidden md:overflow-visible">
        <button
          type="button"
          onClick={onToggle}
          disabled={toggleDisabled}
          aria-expanded={isExpanded}
          aria-controls="checkout-payment-panel-content"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left md:hidden disabled:cursor-not-allowed"
        >
          <span>
            <span className="block text-xs font-medium text-muted-foreground">
              Payment
            </span>
            <span className="block text-sm font-semibold">{statusText}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-bold text-sm">{totalLabel}</span>
            <ChevronUp
              className={cn(
                "h-5 w-5 ease-out",
                duration,
                !prefersReducedMotion && "transition-transform",
                isExpanded && "rotate-180",
              )}
              aria-hidden="true"
            />
            <span className="sr-only">
              {isExpanded
                ? "Collapse payment section"
                : "Expand payment section"}
            </span>
          </span>
        </button>

        <div
          className={cn(
            "overflow-hidden ease-out md:!max-h-none md:overflow-visible",
            duration,
            !prefersReducedMotion && "transition-[max-height]",
            isExpanded ? "max-h-[60dvh]" : "max-h-0",
          )}
        >
          <div
            className={cn(
              "ease-out md:!translate-y-0 md:!opacity-100",
              duration,
              !prefersReducedMotion && "transition-[opacity,transform]",
              isExpanded
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0",
            )}
          >
            <div
              id="checkout-payment-panel-content"
              className="max-h-[60dvh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 md:max-h-none md:overflow-visible md:p-6"
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
