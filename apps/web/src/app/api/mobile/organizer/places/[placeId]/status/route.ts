import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import {
  type PlaceTemporaryStatus,
  setPlaceTemporaryStatusCore,
} from "@/utils/placeHoursStatusCore";
import { logger } from "@abonten/core/logger";

const VALID: PlaceTemporaryStatus[] = [
  null,
  "temporarily_closed",
  "permanently_closed",
];

// POST /api/mobile/organizer/places/:placeId/status
//   { status: null | "temporarily_closed" | "permanently_closed", note?: string }
// Same body as setPlaceTemporaryStatus. A note without a status is dropped.
// 404 unless the place is the caller's.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    const body = (await req.json().catch(() => null)) as {
      status?: unknown;
      note?: unknown;
    } | null;

    const status = (body?.status ?? null) as PlaceTemporaryStatus;
    if (!VALID.includes(status)) {
      return apiJson({
        status: 400,
        message:
          "status must be null, 'temporarily_closed' or 'permanently_closed'",
      });
    }

    const note = typeof body?.note === "string" ? body.note : null;

    const result = await setPlaceTemporaryStatusCore(
      auth.supabase,
      auth.user.id,
      placeId,
      status,
      note,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/places/:id/status failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
