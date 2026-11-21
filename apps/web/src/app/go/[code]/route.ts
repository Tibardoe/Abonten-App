import { qrLinkTarget } from "@abonten/core/brand/qrLinks";
import { NextResponse } from "next/server";

// GET /go/<code> — where printed QR codes land (flyers, stickers, posters).
// The table and the reasons it exists live in @abonten/core/brand/qrLinks.
// Temporary redirect, so a code can be re-pointed without reprinting;
// unknown codes go to the homepage rather than a 404. /go/app answers per
// phone (its store once listed), so the response is never cached. A
// listing page's "Get the app" adds ?open=<listing path>&src=<code>, which
// an Android phone's Play Store link carries through the install
// (docs/architecture/social-distribution.md).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const url = new URL(req.url);
  const target = qrLinkTarget(
    code,
    req.headers.get("user-agent"),
    undefined,
    url.searchParams,
  );
  const res = NextResponse.redirect(new URL(target, url.origin), 307);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
