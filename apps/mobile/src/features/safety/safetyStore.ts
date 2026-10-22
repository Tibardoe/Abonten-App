import type { SafetyLocationBody } from "@abonten/api-client";
import type {
  SafetyEmergencyNumber,
  SafetyOverview,
} from "@abonten/types/safetyType";
import * as SecureStore from "expo-secure-store";

// What Safety keeps on the phone, in SecureStore (the keychain / keystore),
// per account:
//
//   snapshot  the trusted contacts' names and numbers and the market's
//             emergency numbers, so SOS still works with no connection: the
//             app opens the phone's own Messages app to these people.
//   pending   an SOS the server has not confirmed yet (no connection, or
//             the answer was lost). It is retried with the SAME request id
//             when the connection is back, so Abonten never sends it twice.
//
// Nothing else (no positions, no history). Both are deleted on sign-out.

export type SafetySnapshot = {
  contacts: { name: string; phoneE164: string }[];
  emergencyNumbers: SafetyEmergencyNumber[];
  /** An open session the reporter should keep sending positions for. */
  openSessionId: string | null;
  savedAt: number;
};

export type PendingSos = {
  clientRequestId: string;
  startedAt: number;
  location: SafetyLocationBody | null;
  eventId: string | null;
  note?: string;
};

const safeId = (userId: string) => userId.replace(/[^A-Za-z0-9._-]/g, "");
const snapshotKey = (userId: string) =>
  `abonten.safety.snapshot.${safeId(userId)}`;
const pendingKey = (userId: string) =>
  `abonten.safety.pending.${safeId(userId)}`;

/** A pending SOS older than this is dropped rather than sent late. */
export const PENDING_SOS_MAX_AGE_MS = 60 * 60_000;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    // Best effort: the online path never depends on it.
  }
}

export function readSafetySnapshot(
  userId: string,
): Promise<SafetySnapshot | null> {
  return readJson<SafetySnapshot>(snapshotKey(userId));
}

export async function saveSafetySnapshot(
  userId: string,
  overview: SafetyOverview,
): Promise<void> {
  const open =
    overview.active &&
    (overview.active.status === "active" ||
      overview.active.status === "alerting")
      ? overview.active.id
      : null;
  await writeJson(snapshotKey(userId), {
    contacts: overview.contacts
      .filter((c) => c.status !== "declined")
      .map((c) => ({ name: c.name, phoneE164: c.phoneE164 })),
    emergencyNumbers: overview.emergencyNumbers,
    openSessionId: open,
    savedAt: Date.now(),
  } satisfies SafetySnapshot);
}

export function readPendingSos(userId: string): Promise<PendingSos | null> {
  return readJson<PendingSos>(pendingKey(userId));
}

export function savePendingSos(
  userId: string,
  pending: PendingSos,
): Promise<void> {
  return writeJson(pendingKey(userId), pending);
}

export async function clearPendingSos(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(pendingKey(userId)).catch(() => {});
}

/** Sign-out: nothing about this account's Safety stays on the phone. */
export async function clearSafetyStorage(userId: string): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(snapshotKey(userId)).catch(() => {}),
    SecureStore.deleteItemAsync(pendingKey(userId)).catch(() => {}),
  ]);
}
