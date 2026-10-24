import type {
  IdentityDocumentOption,
  IdentityMarketConfig,
  IdentityProviderKey,
} from "@abonten/types/identityType";

// market.identity_config → the documents a market accepts. Anything that does
// not look like a provider code is dropped, so a typo in Admin › Markets
// hides one document instead of breaking the page.

const PROVIDERS: IdentityProviderKey[] = ["smile_id", "test"];

export const EMPTY_IDENTITY_CONFIG: IdentityMarketConfig = {
  provider: null,
  documents: [],
};

export function parseIdentityConfig(raw: unknown): IdentityMarketConfig {
  if (!raw || typeof raw !== "object") return EMPTY_IDENTITY_CONFIG;
  const value = raw as { provider?: unknown; documents?: unknown };
  const provider = PROVIDERS.includes(value.provider as IdentityProviderKey)
    ? (value.provider as IdentityProviderKey)
    : null;
  const documents: IdentityDocumentOption[] = [];
  const seen = new Set<string>();
  if (Array.isArray(value.documents)) {
    for (const d of value.documents) {
      if (!d || typeof d !== "object") continue;
      const type = (d as { type?: unknown }).type;
      const method = (d as { method?: unknown }).method;
      if (
        typeof type === "string" &&
        /^[A-Z0-9_]{2,40}$/.test(type) &&
        typeof method === "string" &&
        /^[a-z_]{2,40}$/.test(method) &&
        !seen.has(type)
      ) {
        seen.add(type);
        documents.push({ type, method });
      }
    }
  }
  return { provider, documents };
}
