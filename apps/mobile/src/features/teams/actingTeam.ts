import type { TeamRoleCode } from "@abonten/types/teamType";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

// "Managing as" in the app (docs/architecture/team-accounts.md, stage 2).
// The chosen team rides on every signed-in request as `x-abonten-team`
// (lib/api.ts); it only selects — the server re-checks the membership and
// the role each time, and routes that do not act for an account ignore it.
//
// Remembered per account on this phone (SecureStore, keyed by user id), so
// door staff reopening the app on the night are still on the team. A
// different account starts on its own; signing out forgets it. The name and
// role are kept beside the id only so the screens can show the right panel
// at once; useActingTeams refreshes them from the server.

export type ActingChoice = {
  teamId: string;
  name: string | null;
  role: TeamRoleCode;
};

type State = { userId: string | null; choice: ActingChoice | null };

let state: State = { userId: null, choice: null };
const listeners = new Set<() => void>();

const keyFor = (userId: string) => `abn.actingTeam.${userId}`;

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => state.choice;

/** The account whose choice is loaded (null before a session). */
export function actingUserId(): string | null {
  return state.userId;
}

/** The chosen team's id, for the request header (null = own account). */
export function getActingTeamId(): string | null {
  return state.choice?.teamId ?? null;
}

/** The chosen team, re-rendering when it changes. */
export function useActingChoice(): ActingChoice | null {
  return useSyncExternalStore(subscribe, read, read);
}

/** Loads the account's remembered choice (once per account). */
export async function restoreActingTeam(userId: string): Promise<void> {
  if (state.userId === userId) return;
  set({ userId, choice: null });
  try {
    const saved = await SecureStore.getItemAsync(keyFor(userId));
    if (!saved || state.userId !== userId) return;
    const parsed = JSON.parse(saved) as Partial<ActingChoice>;
    if (typeof parsed.teamId === "string" && typeof parsed.role === "string") {
      set({
        userId,
        choice: {
          teamId: parsed.teamId,
          name: typeof parsed.name === "string" ? parsed.name : null,
          role: parsed.role as TeamRoleCode,
        },
      });
    }
  } catch {
    // Unreadable storage: the person manages as themselves.
  }
}

/** Chooses a team (or null for the person's own account) and remembers it. */
export function chooseActingTeam(
  userId: string,
  choice: ActingChoice | null,
): void {
  set({ userId, choice });
  const key = keyFor(userId);
  void (
    choice
      ? SecureStore.setItemAsync(key, JSON.stringify(choice))
      : SecureStore.deleteItemAsync(key)
  ).catch(() => undefined);
}

/** Signed out: back to no choice, and the stored one goes. */
export function forgetActingTeam(userId: string | null): void {
  set({ userId: null, choice: null });
  if (userId) {
    void SecureStore.deleteItemAsync(keyFor(userId)).catch(() => undefined);
  }
}
