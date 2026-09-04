import { reportClientError } from "./reportClientError";

// Catches uncaught JS errors that never reach a React error boundary —
// rejected promises with no handler, throws inside timers / native
// callbacks, early-boot failures. React Native routes all of these through
// ErrorUtils' global handler; we chain ours in front of the existing one
// (the RN LogBox / red-screen handler) so behaviour is unchanged, just
// observed.

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsShape = {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
};

// ErrorUtils is a React Native global that isn't in the TS lib surface.
const ErrorUtils: ErrorUtilsShape =
  (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils ?? {};

let installed = false;

export function installGlobalErrorHandler(): void {
  if (installed) return;
  installed = true;

  const previous = ErrorUtils.getGlobalHandler?.();

  ErrorUtils.setGlobalHandler?.((error, isFatal) => {
    reportClientError(error, {
      severity: isFatal ? "fatal" : "error",
      extra: { source: "globalHandler", isFatal: !!isFatal },
    });
    // Preserve the default behaviour (red screen in dev, crash in prod).
    previous?.(error, isFatal);
  });
}
