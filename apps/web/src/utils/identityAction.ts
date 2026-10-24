import { parseDiscoveryInput, requireDiscoveryUser } from "./discoveryAction";

// Shared plumbing for the identity Server Actions (src/actions/identity/*).
// The identity tables have no client grants at all, so every core receives
// the service-role client after the person is resolved here; the
// /api/mobile/identity/** routes call the same cores.

export {
  parseDiscoveryInput as parseIdentityInput,
  requireDiscoveryUser as requireIdentityUser,
};
