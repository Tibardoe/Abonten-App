import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { checkInTicketCore } from "@/utils/checkInTicketCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/organizer/tickets/:ticketId/check-in  { checkedIn: boolean }
// Flips a ticket between 'active' and 'used' — the same transition the web
// AttendanceListView "Check in" / "undo" buttons run. Organizer-scoped:
// 403 unless the caller owns the ticket's event.
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
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/tickets/:id/check-in failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
