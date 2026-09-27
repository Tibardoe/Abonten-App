import { qrLinkDestination } from "@abonten/core/brand/qrLinks";
import { NextResponse } from "next/server";

// GET /go/<code> — where printed QR codes land (flyers, stickers, posters).
// The table and the reasons it exists live in @abonten/core/brand/qrLinks.
// Temporary redirect, so a code can be re-pointed without reprinting;
// unknown codes go to the homepage rather than a 404.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  return NextResponse.redirect(
    new URL(qrLinkDestination(code), new URL(req.url).origin),
    307,
  );
}
