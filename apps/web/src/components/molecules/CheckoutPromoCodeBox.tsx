import { Input } from "../ui/input";

type AppliedPromo = {
  code: string;
  discountPercentage: number;
  remainingUses: number | null;
};

type PromoEligibility = {
  totalQuantity: number;
  eligibleTotal: number;
  isPartial: boolean;
} | null;

type CheckoutPromoCodeBoxProps = {
  promoCodeInput: string;
  onPromoCodeInputChange: (value: string) => void;
  appliedPromo: AppliedPromo | null;
  isApplying: boolean;
  onApply: () => void;
  onRemove: () => void;
  promoEligibility: PromoEligibility;
};

export default function CheckoutPromoCodeBox({
  promoCodeInput,
  onPromoCodeInputChange,
  appliedPromo,
  isApplying,
  onApply,
  onRemove,
  promoEligibility,
}: CheckoutPromoCodeBoxProps) {
  return (
    <div className="flex flex-col text-sm gap-2">
      <span>Promo Code</span>

      <div className="space-y-2 flex flex-col">
        <div className="flex h-10 items-center justify-between gap-3 rounded-md border border-input bg-background pr-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <Input
            type="text"
            className="h-full flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            placeholder="Enter code"
            value={promoCodeInput}
            disabled={!!appliedPromo}
            onChange={(e) => onPromoCodeInputChange(e.target.value)}
          />

          <button
            type="button"
            className="font-bold disabled:opacity-50"
            disabled={isApplying || !promoCodeInput || !!appliedPromo}
            onClick={onApply}
          >
            {isApplying ? "Loading..." : "Apply"}
          </button>
        </div>

        {appliedPromo && (
          <button
            type="button"
            onClick={onRemove}
            className="self-end font-bold border border-border rounded-md p-2"
          >
            Remove
          </button>
        )}

        {promoEligibility?.isPartial && (
          <p className="text-xs text-muted-foreground">
            Promo code applies to {promoEligibility.eligibleTotal} of{" "}
            {promoEligibility.totalQuantity} selected tickets — its usage limit
            has been reached. The remaining{" "}
            {promoEligibility.totalQuantity - promoEligibility.eligibleTotal}{" "}
            ticket(s) are charged at full price.
          </p>
        )}
      </div>
    </div>
  );
}
