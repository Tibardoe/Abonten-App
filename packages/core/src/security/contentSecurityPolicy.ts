// Content Security Policy builders for the two Next.js apps. The policy is
// assembled here (framework-free, unit-tested) and attached to responses in
// each app's proxy.ts, which already runs on every page request and skips
// static assets.
//
// Why an allow-list rather than per-request nonces: a nonce-based policy
// forces every page into dynamic rendering (a fresh nonce per response), and
// the web app serves 200+ prerendered event, place, help and legal pages.
// The allow-list keeps those static and still closes the important doors:
// no script may load from an origin that is not ours or one of the named
// providers, no plugins, no <base> hijack, no framing, forms post only to
// us. 'unsafe-inline' for scripts is required by Next.js's own inline
// bootstrap; it is the one concession, and it is why the origin allow-list
// matters.

export type CspOptions = {
  /** NEXT_PUBLIC_SUPABASE_URL, e.g. https://xyz.supabase.co */
  supabaseUrl?: string | null;
  /** NEXT_PUBLIC_SENTRY_DSN; used for connect-src and violation reports. */
  sentryDsn?: string | null;
  /** `next dev` needs eval and its HMR websocket. */
  development?: boolean;
  /** Vercel preview deployments inject the vercel.live toolbar. */
  vercelPreview?: boolean;
};

export type SentryCspEndpoints = {
  /** Origin the browser SDK talks to, for connect-src. */
  ingestOrigin: string;
  /** Endpoint that accepts CSP violation reports, for report-uri. */
  reportUri: string;
};

/**
 * A Sentry DSN looks like https://<key>@o<org>.ingest.sentry.io/<project>.
 * Returns null for anything that does not parse, so a malformed DSN never
 * produces a malformed policy.
 */
export function sentryCspEndpoints(
  dsn: string | null | undefined,
): SentryCspEndpoints | null {
  if (!dsn) return null;
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const key = url.username;
  const project = url.pathname.replace(/^\/+/, "").split("/")[0];
  if (!key || !project || !url.hostname) return null;
  const ingestOrigin = `${url.protocol}//${url.host}`;
  return {
    ingestOrigin,
    reportUri: `${ingestOrigin}/api/${project}/security/?sentry_key=${key}`,
  };
}

function origin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function serialize(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([name, values]) =>
      values.length === 0 ? name : `${name} ${values.join(" ")}`,
    )
    .join("; ");
}

/** The consumer web app (abontenhub.com). */
export function buildWebCsp(options: CspOptions = {}): string {
  const supabase = origin(options.supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^https:/, "wss:") : null;
  const sentry = sentryCspEndpoints(options.sentryDsn);
  const dev = options.development === true;
  const preview = options.vercelPreview === true;

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    // Paystack inline checkout
    "https://js.paystack.co",
    // Google Maps JavaScript API (+ its Places library)
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
  ];
  if (dev) scriptSrc.push("'unsafe-eval'");
  if (preview) scriptSrc.push("https://vercel.live");

  const connectSrc = ["'self'"];
  if (supabase) connectSrc.push(supabase);
  if (supabaseWs) connectSrc.push(supabaseWs);
  connectSrc.push(
    // Signed direct uploads from the browser
    "https://api.cloudinary.com",
    // Media probes / blob fetches for sharing
    "https://res.cloudinary.com",
    // Client-side reverse geocoding + Places
    "https://maps.googleapis.com",
    // Coarse location fallback in usePlacesAutocomplete / useUserLocation
    "https://ipapi.co",
    // Paystack inline may call its own API from the host page
    "https://api.paystack.co",
    "https://checkout.paystack.com",
  );
  if (sentry) connectSrc.push(sentry.ingestOrigin);
  if (dev) connectSrc.push("ws://localhost:*", "http://localhost:*");
  if (preview) connectSrc.push("https://vercel.live", "wss://*.pusher.com");

  const frameSrc = [
    "'self'",
    "https://checkout.paystack.com",
    "https://*.paystack.com",
    "https://*.paystack.co",
  ];
  if (preview) frameSrc.push("https://vercel.live");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://res.cloudinary.com",
      "https://*.googleusercontent.com",
      "https://maps.googleapis.com",
      "https://maps.gstatic.com",
      "https://*.gstatic.com",
      "https://*.ggpht.com",
      ...(supabase ? [supabase] : []),
    ],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "media-src": ["'self'", "blob:", "data:", "https://res.cloudinary.com"],
    "connect-src": connectSrc,
    "frame-src": frameSrc,
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  if (!dev) directives["upgrade-insecure-requests"] = [];
  if (sentry) directives["report-uri"] = [sentry.reportUri];

  return serialize(directives);
}

/** The operations console (admin.abontenhub.com): no third-party scripts. */
export function buildAdminCsp(options: CspOptions = {}): string {
  const supabase = origin(options.supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^https:/, "wss:") : null;
  const sentry = sentryCspEndpoints(options.sentryDsn);
  const dev = options.development === true;
  const preview = options.vercelPreview === true;

  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (dev) scriptSrc.push("'unsafe-eval'");
  if (preview) scriptSrc.push("https://vercel.live");

  const connectSrc = ["'self'"];
  if (supabase) connectSrc.push(supabase);
  if (supabaseWs) connectSrc.push(supabaseWs);
  if (sentry) connectSrc.push(sentry.ingestOrigin);
  if (dev) connectSrc.push("ws://localhost:*", "http://localhost:*");
  if (preview) connectSrc.push("https://vercel.live", "wss://*.pusher.com");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://res.cloudinary.com",
      "https://*.googleusercontent.com",
      ...(supabase ? [supabase] : []),
    ],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "blob:", "https://res.cloudinary.com"],
    "connect-src": connectSrc,
    "frame-src": preview ? ["'self'", "https://vercel.live"] : ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  if (!dev) directives["upgrade-insecure-requests"] = [];
  if (sentry) directives["report-uri"] = [sentry.reportUri];

  return serialize(directives);
}
