import getSubscriptionCheckout from "@/actions/getSubscriptionCheckout";
import getTicketCheckout from "@/actions/getTicketCheckout";
import getUserPendingTicketCheckouts from "@/actions/getUserPendingTicketCheckouts";
import CheckoutExpiryBanner from "@/components/molecules/CheckoutExpiryBanner";
import OrderSummary from "@/components/molecules/OrderSummary";
import PendingCheckoutsBasket from "@/components/organisms/PendingCheckoutsBasket";
import type { CheckoutSessionStatus } from "@/types/ticketType";
import ContinueButton from "@/wallet/atoms/ContinueButton";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";
import Link from "next/link";

// Per-user, request-time data (this specific session's status plus every
// other pending checkout) — see wallet/page.tsx for why force-dynamic.
export const dynamic = "force-dynamic";

export default async function page({
  params,
  searchParams,
}: {
  params: Promise<{ checkoutId: string }>;
  searchParams: Promise<{ type: string }>;
}) {
  const { checkoutId } = await params;
  const checkoutType = (await searchParams).type;

  // Subscription checkouts are a single, standalone purchase — not part of
  // the ticket basket — so this branch is unchanged from before.
  if (checkoutType === "subscription") {
    const response = await getSubscriptionCheckout(checkoutId);

    if (response.status !== 200 || !response.data?.length) {
      return (
        <div>
          <p>Order processed successfully!</p>
        </div>
      );
    }

    const data = response.data[0];
    const sessionStatus: CheckoutSessionStatus =
      data.status === "pending"
        ? "pending"
        : data.status === "paid"
          ? "paid"
          : "expired";
    const expiresAt = sessionStatus === "pending" ? data.expires_at : null;

    const orderSummary = {
      planName: data.subscription_plan.name,
      amount: data.subscription_plan.unit_price,
      features: data.features,
      totalAmount: data.total_price,
      status: sessionStatus,
      expiresAt,
      type: "subscription" as const,
    };

    return (
      <div className="flex flex-col justify-center gap-5">
        <div>
          <h1 className="font-bold text-xl md:text-2xl">Wallets</h1>
        </div>

        {sessionStatus === "paid" && (
          <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary text-center">
            Purchase complete.
          </div>
        )}

        {sessionStatus === "expired" && (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
            <p>This checkout has expired and can no longer be completed.</p>
            <Link href="/plans" className="inline-block underline font-medium">
              Start a new checkout
            </Link>
          </div>
        )}

        {sessionStatus === "pending" && expiresAt && (
          <CheckoutExpiryBanner expiresAt={expiresAt} />
        )}

        <OrderSummary orderSummary={orderSummary} checkoutId={checkoutId} />

        {sessionStatus === "pending" && (
          <>
            <AddWalletButton />
            <ContinueButton />
          </>
        )}
      </div>
    );
  }

  // Resolve THIS session's status purely to show a transient "just now"
  // banner (paid/expired) — the pending case shows no page-level banner
  // since each basket card already has its own countdown, and the basket
  // (not this page) now owns all "how do I pay for a pending session" UI.
  let sessionStatus: CheckoutSessionStatus | null = null;
  let eventCode = "";

  const res = await getTicketCheckout(checkoutId);
  if (res.status === 200 && res.data?.length) {
    const allRows = res.data;
    const pendingRows = allRows.filter((row) => row.status === "pending");
    const paidRows = allRows.filter((row) => row.status === "paid");

    // "expired" (a real timeout — worth an alarm banner) and "cancelled"
    // (the user removed it on purpose, e.g. via the basket's "Remove
    // checkout"/delete-line actions) both leave zero pending/paid rows, but
    // they mean very different things to the user — don't lump them together.
    sessionStatus =
      pendingRows.length > 0
        ? "pending"
        : paidRows.length > 0
          ? "paid"
          : allRows.some((row) => row.status === "expired")
            ? "expired"
            : "cancelled";
    eventCode = allRows[0].event.event_code;
  }

  const basketResponse = await getUserPendingTicketCheckouts();
  const sessions = basketResponse.status === 200 ? basketResponse.sessions : [];

  return (
    <div className="flex flex-col justify-center gap-5">
      <div>
        <h1 className="font-bold text-xl md:text-2xl">Order Summary</h1>
      </div>

      {sessionStatus === "paid" && (
        <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary text-center">
          Purchase complete —{" "}
          <Link href="/manage/my-events" className="underline">
            view your tickets
          </Link>
          .
        </div>
      )}

      {sessionStatus === "expired" && (
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
          <p>This checkout has expired and can no longer be completed.</p>
          {eventCode && (
            <Link
              href={`/events/${eventCode.toLowerCase()}`}
              className="inline-block underline font-medium"
            >
              Start a new checkout
            </Link>
          )}
        </div>
      )}

      {/* sessionStatus === "cancelled" means the user removed this exact
          checkout on purpose (e.g. from the basket below) — nothing to
          alarm them about, and the basket already reflects current reality. */}

      <PendingCheckoutsBasket initialSessions={sessions} />
    </div>
  );
}
