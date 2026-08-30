import getUserPendingTicketCheckouts from "@/actions/getUserPendingTicketCheckouts";
import PendingCheckoutsBasket from "@/components/organisms/PendingCheckoutsBasket";

// This page is always per-user, request-time basket data (which pending
// checkouts exist right now) — force-dynamic matches the same precedent
// manage/my-events/page.tsx already established for the same reason.
export const dynamic = "force-dynamic";

export default async function page() {
  const response = await getUserPendingTicketCheckouts();
  const sessions = response.status === 200 ? response.sessions : [];

  return (
    <div className="flex flex-col justify-center gap-5">
      <PendingCheckoutsBasket initialSessions={sessions} />
    </div>
  );
}
