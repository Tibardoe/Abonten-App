import { formatMoney } from "@abonten/core/formatMoney";

type CheckoutOrderTotalsProps = {
  currency: string | undefined;
  subTotal: number;
  fee: number;
  total: number;
};

// Amounts in the order's own currency, with its own sign and decimals
// (GH₵25.00, ₦2,500.00, ¥1,500) — never a code glued to toFixed(2).
export default function CheckoutOrderTotals({
  currency,
  subTotal,
  fee,
  total,
}: CheckoutOrderTotalsProps) {
  const show = (n: number) =>
    formatMoney(currency, typeof n === "number" ? n : 0);
  return (
    <div className="rounded-2xl mt-5">
      {/* Subtotal */}
      <div className="flex justify-between items-center text-sm text-muted-foreground mb-2">
        <p>Subtotal</p>
        <p className="font-medium tabular-nums">{show(subTotal)}</p>
      </div>

      {/* Customer-paid Abonten service fee */}
      <div className="flex justify-between items-center text-sm text-muted-foreground mb-2">
        <p>Service fee</p>
        <p className="tabular-nums">{show(fee)}</p>
      </div>

      {/* Divider */}
      <hr className="my-3 border-border" />

      {/* Total */}
      <div className="flex justify-between items-center text-base font-bold text-foreground">
        <p>Total</p>
        <p className="tabular-nums">{show(total)}</p>
      </div>
    </div>
  );
}
