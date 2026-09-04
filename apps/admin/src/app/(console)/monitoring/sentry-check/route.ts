import { requireAdmin } from "@/lib/adminGuard";
import { Sentry } from "@/lib/sentry";
import { NextResponse } from "next/server";

// Controlled verification endpoint: GET /monitoring/sentry-check
//
// Sends one deliberate exception to the `abonten-admin` Sentry project
// and returns its event id so an operator can confirm it landed. Gated on
// `monitoring.view` and, like everything under (console), behind the admin
// auth boundary. Safe to leave in place — it never throws a real 500 and
// only an authorised admin can trigger it.
export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    ctx = await requireAdmin({ redirectOnFail: false });
  } catch {
    return NextResponse.json(
      { ok: false, error: "unauthorised" },
      { status: 401 },
    );
  }
  if (!ctx.permissions.includes("monitoring.view")) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }

  const client = Sentry.getClient();
  const dsnConfigured = Boolean(client?.getOptions().dsn);
  const enabled = client?.getOptions().enabled ?? false;

  const eventId = Sentry.captureException(
    new Error(
      `Admin Sentry verification — triggered ${new Date().toISOString()}`,
    ),
    {
      level: "info",
      tags: { source: "admin_sentry_check" },
    },
  );

  // Give the transport a moment so the event id we report is really sent.
  await Sentry.flush(2500).catch(() => {});

  return NextResponse.json({
    ok: true,
    eventId,
    dsnConfigured,
    enabled,
    environment: client?.getOptions().environment ?? null,
    note: enabled
      ? "Event dispatched. Look for it in the abonten-admin project (Issues → search the message)."
      : "Sentry is disabled in this build (not a production build, or no DSN). No event was sent.",
  });
}
