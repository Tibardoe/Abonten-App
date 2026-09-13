import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { ZodType, ZodTypeDef } from "zod";

// One handler shape for the Discovery mobile routes (search, discovery
// programme, notification preferences, subscriptions, prompts,
// recommendations): Bearer auth (optional where signed-out use is allowed),
// input from the query string (GET/DELETE) or JSON body, validated by the
// shared zod schema in @abonten/validation/discoverySchemas, then the same
// @abonten/services core the web Server Action calls.

type Envelope = { status: number; message?: string; data?: unknown };

export type DiscoveryRouteContext<T> = {
  svc: ServiceRoleClient;
  userId: string | null;
  data: T;
  ip: string;
  platform: "ios" | "android";
};

export async function discoveryRoute<T>(
  req: Request,
  opts: {
    schema: ZodType<T, ZodTypeDef, unknown>;
    label: string;
    /** Signed-out callers allowed (search). Default false. */
    allowAnonymous?: boolean;
    params?: Record<string, string>;
  },
  run: (ctx: DiscoveryRouteContext<T>) => Promise<Envelope>,
) {
  const hasBearer = /^Bearer\s+\S+/i.test(
    req.headers.get("authorization") ?? "",
  );
  let userId: string | null = null;
  if (hasBearer || !opts.allowAnonymous) {
    const auth = await getMobileAuth(req);
    if (auth.response) return auth.response;
    userId = auth.user.id;
  }

  try {
    let raw: Record<string, unknown>;
    if (req.method === "GET" || req.method === "DELETE") {
      raw = Object.fromEntries(new URL(req.url).searchParams.entries());
    } else {
      const body = (await req.json().catch(() => null)) as unknown;
      raw =
        body && typeof body === "object"
          ? (body as Record<string, unknown>)
          : {};
    }
    const parsed = opts.schema.safeParse({ ...raw, ...(opts.params ?? {}) });
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }
    const platformHeader = req.headers.get("x-abonten-platform");
    return apiJson(
      await run({
        svc: getSupabaseServiceClient(),
        userId,
        data: parsed.data,
        ip:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
        platform: platformHeader === "ios" ? "ios" : "android",
      }),
    );
  } catch (error) {
    logger.error(`mobile ${opts.label} failed`, error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}

/** For routes that require a session: narrows userId to string. */
export function signedIn(userId: string | null): string {
  if (!userId) throw new Error("discoveryRoute: session required");
  return userId;
}
