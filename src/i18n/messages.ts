import type { Locale } from "./config";

const namespaces = [
  "common",
  "navigation",
  "auth",
  "settings",
  "events",
] as const;

export type Messages = Record<string, unknown>;

export async function loadMessages(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    namespaces.map(
      async (namespace) =>
        [
          namespace,
          (await import(`../../messages/${locale}/${namespace}.json`)).default,
        ] as const,
    ),
  );

  return Object.fromEntries(entries);
}
