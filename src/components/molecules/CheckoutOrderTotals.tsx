type CheckoutOrderTotalsProps = {
  currency: string | undefined;
  subTotal: number;
  fee: number;
  total: number;
};

export default function CheckoutOrderTotals({
  currency,
  subTotal,
  fee,
  total,
}: CheckoutOrderTotalsProps) {
  return (
    <div className="rounded-2xl mt-5">
      {/* Subtotal */}
      <div className="flex justify-between items-center text-sm text-muted-foreground mb-2">
        <p>Subtotal</p>
        <p>
          <span className="font-medium">{currency}</span>
          {typeof subTotal === "number" ? subTotal.toFixed(2) : "0.00"}
        </p>
      </div>

      {/* Customer-paid Abonten service fee */}
      <div className="flex justify-between items-center text-sm text-muted-foreground mb-2">
        <p>Service fee</p>
        <p>
          <span className="font-medium">{currency}</span>{" "}
          {typeof fee === "number" ? fee.toFixed(2) : "0.00"}
        </p>
      </div>

      {/* Divider */}
      <hr className="my-3 border-border" />

      {/* Total */}
      <div className="flex justify-between items-center text-base font-bold text-foreground">
        <p>Total</p>
        <p>
          <span className="text-primary">{currency}</span>{" "}
          {typeof total === "number" ? total.toFixed(2) : "0.00"}
        </p>
      </div>
    </div>
  );
}
