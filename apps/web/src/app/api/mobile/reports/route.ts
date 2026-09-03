import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { submitReportCore } from "@abonten/services/reports/submitReportCore";
import { submitReportSchema } from "@abonten/validation/reportSchema";

// POST /api/mobile/reports
//   { targetType, targetId, category, details?, attachment? }
//
// User-facing content report from the native app. Same submitReportCore the
// web submitReport action runs; reporter_id is taken from the Bearer
// identity, not the body.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return apiJson({ status: 400, message: "Invalid request body" });

    const parsed = submitReportSchema.safeParse({
      targetType: body.targetType,
      targetId: body.targetId,
      category: body.category,
      details: typeof body.details === "string" ? body.details : "",
      attachment: body.attachment ?? null,
    });
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? "Please check your report.",
      });
    }

    const result = await submitReportCore(auth.supabase, auth.user.id, {
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      category: parsed.data.category,
      details:
        typeof parsed.data.details === "string" ? parsed.data.details : null,
      source: "mobile",
      attachment: (body.attachment as never) ?? null,
    });
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /reports failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
