import { requireAdmin } from "@/lib/adminGuard";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { fetchWithTimeout } from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import {
  isShareSubjectKind,
  shareImageFileName,
  shareImagePath,
} from "@abonten/core/shareKit/shareKit";
import {
  parseRoundupKey,
  roundupCoverFileName,
  roundupCoverPath,
} from "@abonten/core/social/roundups";

// GET /social/image?kind=<events|places|roundups>&key=<code|slug|week-…>
//                   &format=<story|post|cover>[&download=1]
//
// One share-kit image of the posting queue (Admin › Social), fetched from
// this environment's website and handed out from the console's own origin:
// the console's Content-Security-Policy allows images from itself, and a
// browser honours a download's file name only for its own origin (the
// founder saves the picture on a phone, then posts it to Instagram). Only
// the share images can be asked for, by kind, key and format, never an
// address. Behind the admin sign-in and social.view.

const KEY = /^[A-Za-z0-9._-]{1,120}$/;
/** Drawing an image can take a few seconds when it is not cached. */
const IMAGE_TIMEOUT_MS = 15_000;

function plain(status: number, body: string) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function target(
  kind: string | null,
  key: string | null,
  format: string | null,
): { path: string; fileName: string } | null {
  if (!key || !KEY.test(key)) return null;
  if (kind === "roundups") {
    const roundup = parseRoundupKey(key);
    if (!roundup || roundup.slug !== key || format !== "cover") return null;
    return {
      path: roundupCoverPath(roundup, "en"),
      fileName: roundupCoverFileName(roundup),
    };
  }
  if (
    (kind === "events" || kind === "places") &&
    isShareSubjectKind(kind) &&
    (format === "story" || format === "post")
  ) {
    return {
      path: shareImagePath(kind, key, format, "en"),
      fileName: shareImageFileName(key, format),
    };
  }
  return null;
}

export async function GET(req: Request) {
  let permissions: readonly string[];
  try {
    permissions = (await requireAdmin({ redirectOnFail: false })).permissions;
  } catch {
    return plain(401, "Sign in again.");
  }
  if (!permissions.includes("social.view")) return plain(403, "No access.");

  const params = new URL(req.url).searchParams;
  const found = target(
    params.get("kind"),
    params.get("key"),
    params.get("format"),
  );
  if (!found) return plain(404, "Not found.");

  const base = (process.env.WEB_BASE_URL || PUBLIC_SITE_ORIGIN).replace(
    /\/+$/,
    "",
  );
  try {
    const res = await fetchWithTimeout(`${base}${found.path}`, {
      timeoutMs: IMAGE_TIMEOUT_MS,
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      return plain(
        res.status === 404 ? 404 : 502,
        res.status === 404
          ? "This listing has no image any more (it may no longer be public)."
          : `The website could not make the image (${res.status}).`,
      );
    }
    const download = params.get("download") === "1";
    return new Response(await res.arrayBuffer(), {
      headers: {
        "Content-Type": type.split(";")[0],
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${found.fileName}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.warn("Admin social image failed", {
      path: found.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return plain(504, "The website did not answer in time. Try again.");
  }
}
