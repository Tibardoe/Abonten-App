// What the web proxy answers a Server Action request it refuses.
//
// The framework's browser code only accepts an action's own answer; for
// anything else it throws. The one thing it passes on is the body of a
// refusal sent as exactly `text/plain` with a 4xx or 5xx status, which
// becomes the message of the error it throws. So the proxy sends a code,
// and the browser words it in the reader's language
// (apps/web/src/utils/actionUnreachable.ts). A JSON body, which this used
// to be, reached nobody: the caller got "An unexpected response was
// received from the server."

/** The account is restricted, banned or deleted. */
export const ACCOUNT_RESTRICTED_ACTION_CODE = "abonten:account-restricted";

/** The header value the framework's browser code compares with `===`. */
export const ACTION_REFUSAL_CONTENT_TYPE = "text/plain";
