import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";

// The plumbing every /api/mobile/teams/** handler shares: the locale, the
// signed-in person (Bearer token), the body and path parameters checked
// against the same schema the website's Server Action uses, and one place
// that turns an unexpected failure into a 500. The core gets the
// service-role client: the team tables have no client grants.

/** The request itself, for the few handlers that need more than the body. */
export type TeamRouteContext = {
  req: Request;
  /** The person's own client (Bearer), e.g. to read when they signed in. */
  supabase: SupabaseClient<Database>;
};

type Handler<T> = (
  svc: ServiceRoleClient,
  userId: string,
  input: T,
  context: TeamRouteContext,
) => Promise<{ status: number; message?: string; data?: unknown }>;

/**
 * Usage: `teamRoute<{ teamId: string }>()(label, schema, handler)`. The
 * first call names the route's path parameters so Next sees the handler's
 * exact context type.
 */
export function teamRoute<P extends Record<string, string>>() {
  return <T>(
    label: string,
    schema: ZodType<T, ZodTypeDef, unknown>,
    handler: Handler<T>,
    options: { body?: boolean } = { body: true },
  ) =>
    async (
      req: Request,
      ctx: { params: Promise<P> },
    ): Promise<NextResponse> => {
      bindLocaleFromRequest(req);
      const auth = await getMobileAuth(req);
      if (auth.response) return auth.response;
      try {
        const params = (await ctx.params) ?? {};
        const body =
          options.body === false
            ? {}
            : ((await req.json().catch(() => null)) ?? {});
        const parsed = schema.safeParse({ ...body, ...params });
        if (!parsed.success) {
          return apiJson({
            status: 400,
            message: parsed.error.issues[0]?.message ?? tr("invalidInput"),
          });
        }
        const result = await handler(
          getSupabaseServiceClient(),
          auth.user.id,
          parsed.data,
          { req, supabase: auth.supabase },
        );
        const res = apiJson(result);
        res.headers.set("Cache-Control", "private, no-store");
        return res;
      } catch (error) {
        logger.error(`mobile ${label} failed`, error);
        return apiJson({ status: 500, message: tr("somethingWentWrong") });
      }
    };
}
