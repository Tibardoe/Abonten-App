import getEventPromotionCheckout from "@/actions/getEventPromotionCheckout";
import getPlacePromotionCheckout from "@/actions/getPlacePromotionCheckout";
import getSubscriptionCheckout from "@/actions/getSubscriptionCheckout";
import getTicketCheckout from "@/actions/getTicketCheckout";
import getUserPendingTicketCheckouts from "@/actions/getUserPendingTicketCheckouts";
import CancelPendingCheckoutButton from "@/components/molecules/CancelPendingCheckoutButton";
import CheckoutExpiryBanner from "@/components/molecules/CheckoutExpiryBanner";
import FulfillmentRecoveryBanner from "@/components/molecules/FulfillmentRecoveryBanner";
import OrderSummary from "@/components/molecules/OrderSummary";
import PaymentMethodSelector from "@/components/organisms/PaymentMethodSelector";
import PendingCheckoutsBasket from "@/components/organisms/PendingCheckoutsBasket";
import { createClient } from "@/config/supabase/server";
import type { PlacePromotionSummaryProps } from "@/types/placeType";
import type { EventPromotionSummaryProps } from "@/types/postsType";
import type { CheckoutSessionStatus } from "@/types/ticketType";
import { getLatestPaymentAttemptStatus } from "@/utils/paymentAttempt";
import Link from "next/link";

// Per-user, request-time data (this specific session's status plus every
// other pending checkout) — see checkout/page.tsx for why force-dynamic.
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
  const supabase = await createClient();

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
          <h1 className="font-bold text-xl md:text-2xl">Order Summary</h1>
        </div>

        {sessionStatus === "paid" && (
          <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary text-center">
            Subscription activated successfully —{" "}
            <Link href="/settings/membership" className="underline">
              view your subscription
            </Link>
            .
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
          <PaymentMethodSelector
            kind="subscription"
            subscriptionCheckoutId={checkoutId}
            amount={orderSummary.totalAmount}
            currency="GHS"
          />
        )}
      </div>
    );
  }

  // Featured Places promotions are a single, standalone purchase — same
  // reasoning as the subscription branch above — not part of the ticket
  // basket.
  if (checkoutType === "promotion") {
    const response = await getPlacePromotionCheckout(checkoutId);

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

    const orderSummary: PlacePromotionSummaryProps = {
      type: "promotion",
      placeName: data.place?.name ?? "",
      tierLabel: data.place_promotion_tier?.duration_label ?? "",
      amount: data.unit_price,
      totalAmount: data.total_price,
      status: sessionStatus,
      expiresAt,
    };

    // A payment_attempt can be stuck "fulfillment_failed" here even though
    // the checkout row itself still reads "pending" (activatePlacePromotion
    // never flips it to "paid" on failure) — check for that before trusting
    // the plain pending/paid/expired banners above.
    const latestAttempt =
      sessionStatus === "pending"
        ? await getLatestPaymentAttemptStatus(
            supabase,
            "place_promotion_checkout_id",
            checkoutId,
          )
        : null;
    const isFulfillmentStuck = latestAttempt?.status === "fulfillment_failed";

    return (
      <div className="flex flex-col justify-center gap-5">
        <div>
          <h1 className="font-bold text-xl md:text-2xl">Order Summary</h1>
        </div>

        {sessionStatus === "paid" && (
          <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary text-center">
            Purchase complete —{" "}
            <Link
              href={`/manage/places/${data.place_id}`}
              className="underline"
            >
              your place is now featured
            </Link>
            .
          </div>
        )}

        {sessionStatus === "expired" && (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
            <p>This checkout has expired and can no longer be completed.</p>
            <Link
              href={`/manage/places/${data.place_id}`}
              className="inline-block underline font-medium"
            >
              Start a new promotion
            </Link>
          </div>
        )}

        {sessionStatus === "pending" && !isFulfillmentStuck && expiresAt && (
          <CheckoutExpiryBanner expiresAt={expiresAt} />
        )}

        <OrderSummary orderSummary={orderSummary} checkoutId={checkoutId} />

        {sessionStatus === "pending" && isFulfillmentStuck && latestAttempt && (
          <FulfillmentRecoveryBanner
            paymentAttemptId={latestAttempt.id}
            initialMessage="Your payment was successful. We're completing your promotion now — tap Retry to finish."
          />
        )}

        {sessionStatus === "pending" && !isFulfillmentStuck && (
          <>
            <PaymentMethodSelector
              kind="promotion"
              placePromotionCheckoutId={checkoutId}
              amount={orderSummary.totalAmount}
              currency={data.currency}
            />
            <CancelPendingCheckoutButton
              checkoutId={checkoutId}
              kind="promotion"
            />
          </>
        )}
      </div>
    );
  }

  // Event promotions are a single, standalone purchase — same reasoning as
  // the subscription/place-promotion branches above.
  if (checkoutType === "event-promotion") {
    const response = await getEventPromotionCheckout(checkoutId);

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

    const orderSummary: EventPromotionSummaryProps = {
      type: "event-promotion",
      eventTitle: data.event?.title ?? "",
      tierLabel: data.event_promotion_tier?.duration_label ?? "",
      amount: data.unit_price,
      totalAmount: data.total_price,
      status: sessionStatus,
      expiresAt,
    };

    // See the place-promotion branch above for why this check exists.
    const latestAttempt =
      sessionStatus === "pending"
        ? await getLatestPaymentAttemptStatus(
            supabase,
            "event_promotion_checkout_id",
            checkoutId,
          )
        : null;
    const isFulfillmentStuck = latestAttempt?.status === "fulfillment_failed";

    return (
      <div className="flex flex-col justify-center gap-5">
        <div>
          <h1 className="font-bold text-xl md:text-2xl">Order Summary</h1>
        </div>

        {sessionStatus === "paid" && (
          <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary text-center">
            Purchase complete —{" "}
            <Link
              href={`/manage/events/${data.event_id}`}
              className="underline"
            >
              your event is now featured
            </Link>
            .
          </div>
        )}

        {sessionStatus === "expired" && (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
            <p>This checkout has expired and can no longer be completed.</p>
            <Link
              href={`/manage/events/${data.event_id}`}
              className="inline-block underline font-medium"
            >
              Start a new promotion
            </Link>
          </div>
        )}

        {sessionStatus === "pending" && !isFulfillmentStuck && expiresAt && (
          <CheckoutExpiryBanner expiresAt={expiresAt} />
        )}

        <OrderSummary orderSummary={orderSummary} checkoutId={checkoutId} />

        {sessionStatus === "pending" && isFulfillmentStuck && latestAttempt && (
          <FulfillmentRecoveryBanner
            paymentAttemptId={latestAttempt.id}
            initialMessage="Your payment was successful. We're completing your promotion now — tap Retry to finish."
          />
        )}

        {sessionStatus === "pending" && !isFulfillmentStuck && (
          <>
            <PaymentMethodSelector
              kind="event-promotion"
              eventPromotionCheckoutId={checkoutId}
              amount={orderSummary.totalAmount}
              currency={data.currency}
            />
            <CancelPendingCheckoutButton
              checkoutId={checkoutId}
              kind="event-promotion"
            />
          </>
        )}
      </div>
    );
  }

  // Resolve THIS session's status purely to show a transient "just now"
  // expired banner — pending and paid both show no page-level banner here:
  // pending because each basket card already has its own countdown, paid
  // because PendingCheckoutsBasket shows its own success panel the moment
  // fulfillment completes (a page-level banner here would double up with
  // it, since both render on this same page). The basket (not this page)
  // owns all "how do I pay for a pending session"/"payment just succeeded"
  // UI.
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
