// Minimal logging wrapper shared by every app and package.
//
// Sinks:
// - On a server in production (Node, NODE_ENV=production) each call is ONE
//   JSON line on stdout/stderr: `{"time","level","msg","data"?}`. Vercel and
//   Docker capture the streams, and a JSON line is what log drains, alert
//   rules and searches can filter by level, message and fields; a
//   free-text `console.error("x", obj)` is not.
// - Everywhere else (browser, React Native, development) the arguments go to
//   the console as they are, so DevTools and Metro keep their inspectors.
//
// Levels: debug < info < warn < error.
// - development (default): everything is printed.
// - production (default): only warn and error are printed.
// - override with LOG_LEVEL (server) or NEXT_PUBLIC_LOG_LEVEL (client/server),
//   e.g. LOG_LEVEL=debug to see everything, LOG_LEVEL=error to see only errors.
//
// It is deliberately not an observability platform: errors that matter go to
// Sentry and the self-hosted error pipeline through their own reporters.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): number {
  // Annotated as string on purpose: under the mobile app's tsconfig
  // `process.env.X` resolves to `any`, so without this the literal
  // comparisons below narrow nothing and LEVEL_ORDER[configured] is an
  // implicit-any index — which is an error the moment @abonten/core/logger is
  // imported from apps/mobile.
  const configured: string = (
    (process.env.LOG_LEVEL as string | undefined) ??
    (process.env.NEXT_PUBLIC_LOG_LEVEL as string | undefined) ??
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

// A Node server process: no `window` (browsers and React Native both define
// one) and a real `process.versions.node`.
const structured =
  process.env.NODE_ENV === "production" &&
  typeof window === "undefined" &&
  typeof process !== "undefined" &&
  typeof process.versions?.node === "string";

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") {
    return String(value);
  }
  return value;
}

/** One JSON line: string arguments join into `msg`, the rest go in `data`. */
export function formatStructured(level: LogLevel, args: unknown[]): string {
  const text: string[] = [];
  const data: unknown[] = [];
  for (const arg of args) {
    if (typeof arg === "string") text.push(arg);
    else if (arg instanceof Error) {
      text.push(arg.message);
      data.push(serializeValue(arg));
    } else data.push(serializeValue(arg));
  }
  const entry: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    msg: text.join(" "),
  };
  if (data.length === 1) entry.data = data[0];
  else if (data.length > 1) entry.data = data;
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({ ...entry, data: "[unserializable]" });
  }
}

function emit(level: LogLevel, args: unknown[]): void {
  if (LEVEL_ORDER[level] < minLevel) return;

  if (structured) {
    const line = formatStructured(level, args);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
    return;
  }

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
