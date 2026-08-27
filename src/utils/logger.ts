// Minimal logging wrapper. On the server, output goes to stdout/stderr, which
// the host (Vercel / Docker) already captures — this module only standardises
// level handling and silences debug/info noise in production. It is deliberately
// not an observability platform; if one is ever adopted, change the sink here.
//
// Levels: debug < info < warn < error.
// - development (default): everything is printed.
// - production (default): only warn and error are printed.
// - override with LOG_LEVEL (server) or NEXT_PUBLIC_LOG_LEVEL (client/server),
//   e.g. LOG_LEVEL=debug to see everything, LOG_LEVEL=error to see only errors.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): number {
  const configured = (
    process.env.LOG_LEVEL ??
    process.env.NEXT_PUBLIC_LOG_LEVEL ??
    ""
  )
    .toLowerCase()
    .trim();

  if (
    configured === "debug" ||
    configured === "info" ||
    configured === "warn" ||
    configured === "error"
  ) {
    return LEVEL_ORDER[configured];
  }

  return process.env.NODE_ENV === "production"
    ? LEVEL_ORDER.warn
    : LEVEL_ORDER.debug;
}

const minLevel = resolveMinLevel();

function emit(level: LogLevel, args: unknown[]): void {
  if (LEVEL_ORDER[level] < minLevel) return;

  if (level === "error") {
    console.error(`[${level}]`, ...args);
  } else if (level === "warn") {
    console.warn(`[${level}]`, ...args);
  } else {
    // debug/info both go to console.info so they can be filtered by the host.
    console.info(`[${level}]`, ...args);
  }
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};

export default logger;
