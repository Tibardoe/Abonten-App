import { NextResponse } from "next/server";

// Mobile API routes return the same envelope shape the Server Actions use
// (`{ status, message?, data? }`), so the typed client in
// @abonten/api-client can treat an action result and an HTTP result
// identically. The HTTP status code always mirrors `status`.

type Envelope<T> = { status: number; message?: string; data?: T };

export function apiJson<T>(body: Envelope<T>): NextResponse {
  return NextResponse.json(body, { status: body.status });
}

/** Forwards a Server-Action-style `{ status, ... }` result straight through. */
export function fromActionResult<T extends { status: number }>(
  result: T,
): NextResponse {
  return NextResponse.json(result, { status: result.status });
}
