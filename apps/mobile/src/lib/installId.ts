import { uuidv4 } from "@/lib/uuid";
import * as SecureStore from "expo-secure-store";

// A random id for this app install, created once and kept in secure storage
// (it survives app updates, not a reinstall). Sent to the API as
// x-abonten-install-id: the server records which accounts use an install,
// as an Abonten Rewards fraud signal (the same phone on a referrer's and a
// buyer's account). It identifies nothing about the person and never gates
// a request.

const KEY = "abonten.installId";
let cached: Promise<string | null> | null = null;

export function getInstallId(): Promise<string | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const existing = await SecureStore.getItemAsync(KEY);
        if (existing) return existing;
        const id = uuidv4();
        await SecureStore.setItemAsync(KEY, id);
        return id;
      } catch {
        return null;
      }
    })();
  }
  return cached;
}
