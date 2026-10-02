import { translatorFor } from "@/i18n/clientTranslator";
import { reportClientError } from "@/lib/reportClientError";
import { ACCOUNT_RESTRICTED_ACTION_CODE } from "@abonten/core/security/actionRefusal";
import {
  unstable_isUnrecognizedActionError,
  unstable_rethrow,
} from "next/navigation";

// A Server Action answers with an envelope and never throws; callers read
// `status`. The call can still reject in the browser, before the action
// runs or instead of its answer:
//   - the connection dropped (on a phone, often);
//   - the tab is older than the deployment, and the server no longer knows
//     the action by the name this page has for it;
//   - the proxy refused the request (a restricted account);
//   - the action crashed on the server.
// Written `await saveThing(input).catch(actionUnreachable)`, the caller gets
// the envelope it already handles: its "busy" state ends, its toast says
// what happened in the reader's language, and what they typed is still
// there. Without it the button stayed busy for good, or (inside a
// transition) the error boundary replaced the page.
//
// scripts/check-action-calls.mjs keeps every call from the browser guarded.

/** The envelope of a call that never reached the action. `status` is 0. */
export type ActionUnreachable = {
  status: 0;
  message: string;
  data?: undefined;
};

function looksLikeDroppedConnection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // fetch() rejects when the request cannot be made or the answer never
  // comes; each browser words it its own way ("Failed to fetch", "Load
  // failed", "NetworkError when attempting to fetch resource.").
  return (
    error.name === "AbortError" ||
    /failed to fetch|networkerror|network request failed|load failed|network connection/i.test(
      error.message,
    )
  );
}

/**
 * Why the call never came back with an answer.
 * - restricted: the proxy refused it, the account is restricted;
 * - updated: the tab is older than the deployment;
 * - offline / unreachable: no connection, or the request was lost;
 * - unexpected: the action itself crashed.
 */
export type ActionFailureCause =
  | "restricted"
  | "updated"
  | "offline"
  | "unreachable"
  | "unexpected";

export function actionFailureCause(error: unknown): ActionFailureCause {
  if (
    error instanceof Error &&
    error.message === ACCOUNT_RESTRICTED_ACTION_CODE
  ) {
    return "restricted";
  }
  if (unstable_isUnrecognizedActionError(error)) return "updated";
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  if (looksLikeDroppedConnection(error)) return "unreachable";
  return "unexpected";
}

/** Trying again cannot help: the person has to do something else first. */
export function isLastingActionFailure(error: unknown): boolean {
  const cause = actionFailureCause(error);
  return cause === "restricted" || cause === "updated";
}

export function actionUnreachable(error: unknown): ActionUnreachable {
  // redirect() and notFound() travel as errors; they are the framework's.
  unstable_rethrow(error);

  const cause = actionFailureCause(error);
  // A crash in the action is ours to look at; the rest is the network.
  if (cause === "unexpected") {
    reportClientError(error, { extra: { boundary: "action" } });
  }
  return {
    status: 0,
    message: translatorFor("common")(`actionFailed.${cause}`),
  };
}
