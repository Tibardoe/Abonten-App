import type { ClientPlatform } from "@abonten/core/market/types";

// How a mobile checkout request says it is paying: a saved instrument
// (`paymentMethodId`) or a way to pay on the provider's page (`method`,
// e.g. "card", "bank_transfer"). App builds released before 2026-09-25 only
// ever send `paymentMethodId`, which keeps working unchanged. The platform
// comes from the `x-abonten-platform` header every build sends; it only
// narrows which methods are offered (Apple Pay on iOS), never the price.
export function paymentChoiceFromBody(
  req: Request,
  body: { paymentMethodId?: unknown; method?: unknown } | null,
): {
  paymentMethodId: string | null;
  method: string | null;
  platform: ClientPlatform;
} {
  const paymentMethodId =
    typeof body?.paymentMethodId === "string" && body.paymentMethodId.length > 0
      ? body.paymentMethodId
      : null;
  const method =
    typeof body?.method === "string" && /^[a-z_]{2,32}$/.test(body.method)
      ? body.method
      : null;
  const platform: ClientPlatform =
    req.headers.get("x-abonten-platform") === "ios" ? "ios" : "android";
  return { paymentMethodId, method, platform };
}
