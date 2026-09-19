import {
  DeadlineError,
  withDeadline,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import { type CreateEmailOptions, Resend } from "resend";

// The one place the web app talks to Resend. Every transactional email
// (tickets, cancellations, reward notices, recommendation digests) goes
// through here so that:
//   - one SDK instance is built per process instead of per send;
//   - every send has a deadline (the SDK exposes no timeout of its own), so
//     a stalled Resend request can never hold a Server Action, an after()
//     task or the delivery-queue route open until the platform kills it;
//   - "not configured" is one decision, not four copies of the same check.
//
// Returns the SDK's own `{ data, error }` shape so callers keep their
// existing error handling; a timeout surfaces as an error whose name is
// "DeadlineError", which the delivery queue treats as retryable.

const RESEND_SEND_TIMEOUT_MS = 15_000;

let client: Resend | null = null;

export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function getClient(): Resend {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  client = new Resend(key);
  return client;
}

export type SendEmailResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string } };

export async function sendEmail(
  payload: CreateEmailOptions,
  options?: { idempotencyKey?: string },
): Promise<SendEmailResult> {
  try {
    const result = await withDeadline(
      getClient().emails.send(payload, options),
      RESEND_SEND_TIMEOUT_MS,
      "Resend email send",
    );
    if (result.error) {
      return {
        data: null,
        error: { name: result.error.name, message: result.error.message },
      };
    }
    if (!result.data) {
      return {
        data: null,
        error: { name: "empty_response", message: "Resend returned no id" },
      };
    }
    return { data: { id: result.data.id }, error: null };
  } catch (error) {
    if (error instanceof DeadlineError) {
      logger.error(`Resend send timed out after ${error.timeoutMs}ms`);
      return {
        data: null,
        error: { name: "DeadlineError", message: error.message },
      };
    }
    throw error;
  }
}
