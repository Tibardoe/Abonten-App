import type {
  IdentityProviderKey,
  IdentityResultStatus,
} from "@abonten/types/identityType";

// One identity provider behind one interface, the way payments are behind
// PaymentProvider: the services never call a provider's API directly, so a
// market can use another provider (or a later contract) without touching
// the flow. Abonten never receives the images: the person goes through the
// provider's hosted page and the provider sends the verdict to our callback.

export type CreateIdentitySessionInput = {
  verificationId: string;
  /** Our id for the person at the provider, unique per attempt. */
  providerUserRef: string;
  country: string;
  documentType: string;
  method: string;
  /** Where the provider posts the verdict (public https). */
  callbackUrl: string;
  /** Where the person lands after the provider's page (UX only). */
  redirectUrl: string;
  privacyPolicyUrl: string;
  logoUrl: string;
  expiresAt: string;
};

export type CreateIdentitySessionResult =
  | { ok: true; url: string; linkRef: string; expiresAt: string }
  | {
      ok: false;
      reason: "not_configured" | "refused" | "unreachable";
      detail: string;
    };

/** A provider's verdict reduced to what Abonten acts on and keeps. */
export type IdentityProviderResult = {
  providerJobId: string | null;
  /** Ours, from the provider's echo of the attempt. */
  providerUserRef: string | null;
  verificationId: string | null;
  status: IdentityResultStatus | "processing";
  reason: string | null;
  riskLevel: string | null;
  fraudDetected: boolean | null;
  providerDuplicate: boolean | null;
  fullName: string | null;
  dateOfBirth: string | null;
  /** The full number, only in memory: it is hashed and cut to four. */
  idNumber: string | null;
  documentExpiresOn: string | null;
};

export type VerifiedCallback =
  | { ok: true; result: IdentityProviderResult }
  | { ok: false; reason: "signature" | "stale" | "malformed"; detail: string };

export type IdentityProviderAdapter = {
  key: IdentityProviderKey;
  /** The provider has what it needs on this deployment. */
  isConfigured(): boolean;
  createSession(
    input: CreateIdentitySessionInput,
  ): Promise<CreateIdentitySessionResult>;
  /** Checks the callback came from the provider; never trusts it alone. */
  verifyCallback(
    headers: Headers,
    rawBody: string,
    now?: number,
  ): VerifiedCallback;
  /**
   * The provider's own answer for a job, asked server to server. The
   * callback's body is not covered by its signature, so the verdict is
   * confirmed here before anything is decided on it.
   */
  fetchStatus(
    jobId: string,
  ): Promise<
    | { ok: true; status: IdentityResultStatus | "processing" | "not_found" }
    | { ok: false; detail: string }
  >;
};
