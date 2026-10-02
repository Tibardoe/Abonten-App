import { localizeEnvelope } from "@abonten/services/i18n/requestLocale";
import { NextResponse } from "next/server";

// Mobile API routes return the same envelope shape the Server Actions use
// (`{ status, message?, data? }`), so the typed client in
// @abonten/api-client can treat an action result and an HTTP result
// identically. The HTTP status code always mirrors `status`. A `message`
// leaves in the language the request asked for (x-abonten-locale, bound by
// the handler): the services word their own messages in it, and anything
// the database wrote is translated here on the way out.

type Envelope<T> = { status: number; message?: string; data?: T };

export function apiJson<T>(body: Envelope<T>): NextResponse {
  const localized = localizeEnvelope(body);
  return NextResponse.json(localized, { status: body.status });
}

/** Forwards a Server-Action-style `{ status, ... }` result straight through. */
export function fromActionResult<T extends { status: number }>(
  result: T,
): NextResponse {
  return NextResponse.json(localizeEnvelope(result), { status: result.status });
}
