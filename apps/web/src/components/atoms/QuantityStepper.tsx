import { IoAddSharp } from "react-icons/io5";
import { TfiMinus } from "react-icons/tfi";

type QuantityStepperProps = {
  quantity: number;
  minQuantity?: number;
  maxQuantity?: number | null;
  disabled?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  /** What is being counted, for screen readers ("General tickets"). */
  label?: string;
};

/**
 * The [-] qty [+] control used both for pre-checkout ticket selection
 * (CheckoutTicketRow, in the modal) and post-checkout quantity edits (the
 * order-summary basket) — same UI, same disabled-state rules, one place to
 * keep them in sync.
 */
export default function QuantityStepper({
  quantity,
  minQuantity = 0,
  maxQuantity = null,
  disabled = false,
  onIncrement,
  onDecrement,
  label = "tickets",
}: QuantityStepperProps) {
  return (
    <fieldset className="flex items-center gap-4" aria-label={label}>
      <button
        type="button"
        disabled={disabled || quantity <= minQuantity}
        onClick={onDecrement}
        aria-label={`Remove one from ${label}`}
        className="w-8 h-8 grid place-items-center text-xl md:text-2xl bg-muted border border-border text-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <TfiMinus aria-hidden />
      </button>

      <output aria-live="polite" aria-label={`${quantity} ${label}`}>
        {quantity}
      </output>

      <button
        type="button"
        disabled={disabled || (maxQuantity !== null && quantity >= maxQuantity)}
        onClick={onIncrement}
        aria-label={`Add one to ${label}`}
        className="w-8 h-8 grid place-items-center text-xl md:text-2xl bg-primary text-primary-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <IoAddSharp aria-hidden />
      </button>
    </fieldset>
  );
}
