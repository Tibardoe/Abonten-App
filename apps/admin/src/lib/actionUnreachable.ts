import * as Sentry from "@sentry/nextjs";
import {
  unstable_isUnrecognizedActionError,
  unstable_rethrow,
} from "next/navigation";

// Every console action answers with a { status, message } envelope and never
// throws; the panels read `status`. The call can still reject in the
// browser: the connection dropped, the tab is older than the deployment, or
// the action crashed. Inside a transition that rejection went to the error
// boundary and replaced the page, with the reason the operator had typed
// and no word on whether the ban, refund or payout had gone through.
//
// Written `await setUserStatus(input).catch(actionUnreachable)`, the panel
// gets the envelope it already handles, and the message says the one thing
// that matters for a staff action: whether it can have been applied.
//
// scripts/check-action-calls.mjs keeps every call from the browser guarded.

/** The envelope of a call that did not come back. `status` is 0. */
export type ActionUnreachable = {
  status: 0;
  message: string;
  data?: undefined;
};

export function actionUnreachable(error: unknown): ActionUnreachable {
  // redirect() and notFound() travel as errors; they are the framework's.
  unstable_rethrow(error);

  if (unstable_isUnrecognizedActionError(error)) {
    return {
      status: 0,
      message:
        "The console has been updated since this page was opened, so nothing was done. Reload the page, then try again.",
    };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      status: 0,
      message: "You're offline, so nothing was sent. Reconnect and try again.",
    };
  }

  Sentry.captureException(error, {
    tags: { source: "admin_action_call" },
    level: "error",
  });
  return {
    status: 0,
    message:
      "The server did not answer, so this may or may not have gone through. Reload the page and check before trying again.",
  };
}
