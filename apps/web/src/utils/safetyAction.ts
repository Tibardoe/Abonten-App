import {
  parseDiscoveryInput,
  requestIp,
  requireDiscoveryUser,
  resolveDiscoveryCaller,
} from "./discoveryAction";

// Shared plumbing for the Abonten Safety Server Actions
// (src/actions/safety/*). Same shape as the Discovery and content actions:
// the safety tables have no client grants at all, so every core receives
// the service-role client after identity is resolved here; the
// /api/mobile/safety/** routes call the same cores. The contact's pages
// (/sos/<token>, /trusted/<token>) need no account: the token in the link
// is the contact's own key, and the address is only used to slow abuse.

export {
  parseDiscoveryInput as parseSafetyInput,
  requireDiscoveryUser as requireSafetyUser,
  resolveDiscoveryCaller as resolveSafetyCaller,
  requestIp as safetyRequestIp,
};
