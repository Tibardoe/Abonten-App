import { describe, expect, it } from "vitest";
import {
  buildAdminCsp,
  buildWebCsp,
  sentryCspEndpoints,
} from "./contentSecurityPolicy";

const DSN = "https://abc123@o4509.ingest.de.sentry.io/4509999";

function directive(policy: string, name: string): string[] {
  const entry = policy
    .split("; ")
    .find((d) => d === name || d.startsWith(`${name} `));
  if (!entry) throw new Error(`${name} missing from policy`);
  return entry.slice(name.length).trim().split(" ").filter(Boolean);
}

describe("sentryCspEndpoints", () => {
  it("derives the ingest origin and the security report endpoint", () => {
    expect(sentryCspEndpoints(DSN)).toEqual({
      ingestOrigin: "https://o4509.ingest.de.sentry.io",
      reportUri:
        "https://o4509.ingest.de.sentry.io/api/4509999/security/?sentry_key=abc123",
    });
  });

  it("returns null for a missing or malformed DSN", () => {
    expect(sentryCspEndpoints(null)).toBeNull();
    expect(sentryCspEndpoints("")).toBeNull();
    expect(sentryCspEndpoints("not a url")).toBeNull();
    expect(sentryCspEndpoints("https://sentry.io/")).toBeNull();
  });
});

describe("buildWebCsp", () => {
  const policy = buildWebCsp({
    supabaseUrl: "https://xyz.supabase.co",
    sentryDsn: DSN,
  });

  it("locks down the dangerous directives", () => {
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("allows only the named script origins", () => {
    expect(directive(policy, "script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://js.paystack.co",
      "https://maps.googleapis.com",
      "https://maps.gstatic.com",
    ]);
  });

  it("lets the browser reach Supabase over https and websocket, and Sentry", () => {
    const connect = directive(policy, "connect-src");
    expect(connect).toContain("https://xyz.supabase.co");
    expect(connect).toContain("wss://xyz.supabase.co");
    expect(connect).toContain("https://o4509.ingest.de.sentry.io");
    expect(connect).toContain("https://api.cloudinary.com");
  });

  it("frames only Paystack", () => {
    expect(directive(policy, "frame-src")).toEqual([
      "'self'",
      "https://checkout.paystack.com",
      "https://*.paystack.com",
      "https://*.paystack.co",
    ]);
  });

  it("reports violations to Sentry", () => {
    expect(directive(policy, "report-uri")).toEqual([
      "https://o4509.ingest.de.sentry.io/api/4509999/security/?sentry_key=abc123",
    ]);
  });

  it("adds eval and the HMR socket only in development", () => {
    const dev = buildWebCsp({ development: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws://localhost:*");
    expect(dev).not.toContain("upgrade-insecure-requests");
    expect(directive(policy, "script-src")).not.toContain("'unsafe-eval'");
  });

  it("ignores an unparseable Supabase URL instead of emitting garbage", () => {
    const p = buildWebCsp({ supabaseUrl: "nope" });
    expect(directive(p, "connect-src")).toEqual(
      expect.not.arrayContaining(["nope"]),
    );
    expect(p).not.toContain("report-uri");
  });
});

describe("buildAdminCsp", () => {
  it("permits no third-party scripts or frames", () => {
    const policy = buildAdminCsp({
      supabaseUrl: "https://xyz.supabase.co",
      sentryDsn: DSN,
    });
    expect(directive(policy, "script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
    ]);
    expect(directive(policy, "frame-src")).toEqual(["'none'"]);
    expect(directive(policy, "connect-src")).toEqual([
      "'self'",
      "https://xyz.supabase.co",
      "wss://xyz.supabase.co",
      "https://o4509.ingest.de.sentry.io",
    ]);
  });
});
