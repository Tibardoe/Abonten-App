import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { checkInTicketCore } from "@abonten/services/tickets/checkInTicketCore";

// POST /api/mobile/organizer/tickets/:ticketId/check-in
//   { checkedIn: boolean, eventId?: string }
// Flips a ticket between 'active' and 'used' — the same transition the web
// AttendanceListView "Check in" / "undo" buttons run. Organizer-scoped:
// 403 unless the caller owns the ticket's event, and 404 when `eventId` is
// sent and the ticket belongs to a different one of their events.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { ticketId } = await params;
    const body = (await req.json().catch(() => null)) as {
      checkedIn?: unknown;
      eventId?: unknown;
    } | null;

    if (typeof body?.checkedIn !== "boolean") {
      return apiJson({
        status: 400,
        message: "checkedIn (boolean) is required",
      });
    }

    const result = await checkInTicketCore(
      auth.supabase,
      auth.user.id,
      ticketId,
      body.checkedIn,
      typeof body.eventId === "string" && body.eventId.length > 0
        ? body.eventId
        : null,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/tickets/:id/check-in failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
