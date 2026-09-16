import { headers } from "next/headers";
import {
  parseDiscoveryInput,
  requestIp,
  requireDiscoveryUser,
  resolveDiscoveryCaller,
} from "./discoveryAction";

// Shared plumbing for the Spotlight + Stories Server Actions
// (src/actions/content/*). Same shape as the Discovery actions: the content
// tables have no client write grants, so every core receives the service
// role client after identity is resolved here; the /api/mobile/content/**
// routes call the same cores.

export {
  parseDiscoveryInput as parseContentInput,
  requireDiscoveryUser as requireContentUser,
  resolveDiscoveryCaller as resolveContentCaller,
  requestIp as contentRequestIp,
};

/** A stable, non-identifying device key for telemetry when the client sends none. */
export async function fallbackViewerKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = h.get("user-agent") ?? "";
  return `${ip}|${ua.slice(0, 80)}`;
}
