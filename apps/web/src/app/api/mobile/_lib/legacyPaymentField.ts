// App builds released before 2026-09-24 read the payment to continue as
// `data.paystack` ({ mode: "popup", reference, accessCode, authorizationUrl }
// or { mode: "direct", reference, chargeStatus, displayMessage? }). Newer
// builds read `data.payment`, which also covers redirect checkouts. Until
// the old builds are gone, attempt responses carry both: `paystack` is the
// same object when it is a Paystack popup or direct charge, otherwise null
// (only markets that open after this date use redirects, and no old build
// can pay there).
export function withLegacyPaystackField<
  T extends { status: number; data?: unknown },
>(result: T): T {
  if (result.status !== 200 || !result.data || typeof result.data !== "object")
    return result;
  const data = result.data as {
    payment?: { provider?: string; mode?: string } | null;
  };
  if (!("payment" in data)) return result;
  const payment = data.payment;
  const legacy =
    payment && payment.provider === "paystack" && payment.mode !== "redirect"
      ? payment
      : null;
  return { ...result, data: { ...data, paystack: legacy } };
}
