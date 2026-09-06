import { logger } from "@abonten/core/logger";
import type { PostgrestError } from "@supabase/supabase-js";

// The messaging RPCs (open_conversation / send_message / ...) do all their
// authorization + business validation in-database and RAISE with a specific
// SQLSTATE. This maps that to the { status, message } envelope every
// transport returns, keeping the user-facing RAISE text for 4xx and hiding
// anything unexpected behind a generic 500.

export type MessagingErrorEnvelope = {
  status: 400 | 403 | 404 | 409 | 429 | 500;
  message: string;
};

export function mapMessagingRpcError(
  error: PostgrestError,
  context: string,
): MessagingErrorEnvelope {
  switch (error.code) {
    case "42501": // insufficient_privilege — our "Not authorized" raises
      return { status: 403, message: "You can't do that here." };
    case "P0002": // no_data_found — "That event no longer exists" etc.
      return {
        status: 404,
        message: error.message || "That no longer exists.",
      };
    case "23514": // check_violation — every business-rule raise
    case "23505": // unique_violation
    case "P0001": // bare raise_exception
      return {
        status: 409,
        message: error.message || "That action isn't allowed right now.",
      };
    default:
      logger.error(`${context}: unexpected messaging RPC error`, error);
      return {
        status: 500,
        message: "Something went wrong. Please try again.",
      };
  }
}
