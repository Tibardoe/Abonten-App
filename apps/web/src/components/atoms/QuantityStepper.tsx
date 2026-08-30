import { IoAddSharp } from "react-icons/io5";
import { TfiMinus } from "react-icons/tfi";

type QuantityStepperProps = {
  quantity: number;
  minQuantity?: number;
  maxQuantity?: number | null;
  disabled?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
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
}: QuantityStepperProps) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        disabled={disabled || quantity <= minQuantity}
        onClick={onDecrement}
        className="w-8 h-8 grid place-items-center text-xl md:text-2xl bg-muted border border-border text-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <TfiMinus />
      </button>

      <span>{quantity}</span>

      <button
        type="button"
        disabled={disabled || (maxQuantity !== null && quantity >= maxQuantity)}
        onClick={onIncrement}
        className="w-8 h-8 grid place-items-center text-xl md:text-2xl bg-primary text-primary-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <IoAddSharp />
      </button>
    </div>
  );
}
