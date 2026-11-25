import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import {
  normalizeUsernameInput,
  sameUsername,
  usernameProblem,
} from "@abonten/core/usernames/usernames";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// "Is this username free?" as the person types (docs/architecture/
// team-accounts.md §4n): their own Edit profile, a team's profile (Owners)
// and the Make-a-team sheet. One request per pause in typing (~450 ms),
// through POST /api/mobile/usernames/check (rate-limited per person,
// well-formed handles only). Nothing is asked for an empty or malformed
// handle (the form's own validation says what is wrong) or for the handle
// the account already has. Saving still relies on the database: a race
// answers "taken" there too.

const DEBOUNCE_MS = 450;

export type UsernameCheckState =
  | { state: "idle" }
  | { state: "checking"; username: string }
  | { state: "available"; username: string }
  | { state: "taken"; username: string; suggestions: string[] }
  | { state: "failed"; username: string };

export function useUsernameCheck(
  typed: string,
  options: {
    /** The handle the account has now (nothing to check when unchanged). */
    current?: string | null;
    /** A team the person is an Owner of. */
    teamId?: string | null;
    /** The Make-a-team sheet: the handle is for a team not made yet. */
    forNewTeam?: boolean;
    /** The team name typed beside it, for suggestions. */
    name?: string | null;
    enabled?: boolean;
  } = {},
): UsernameCheckState {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const handle = normalizeUsernameInput(typed);
  const [settled, setSettled] = useState(handle);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(handle), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [handle]);

  const wanted =
    (options.enabled ?? true) &&
    !!userId &&
    handle.length > 0 &&
    usernameProblem(handle) === null &&
    !(options.current && sameUsername(handle, options.current));

  const query = useQuery({
    queryKey: [
      "mobile",
      "usernames",
      "check",
      userId,
      settled.toLowerCase(),
      options.teamId ?? null,
      options.forNewTeam === true,
    ],
    enabled: wanted && settled === handle,
    queryFn: () =>
      api.usernames.check({
        username: settled,
        teamId: options.teamId ?? null,
        forNewTeam: options.forNewTeam === true,
        name: options.name?.trim() || null,
      }),
    staleTime: 30_000,
    // A refusal for checking too fast says so; it is not retried.
    retry: false,
  });

  if (!wanted) return { state: "idle" };
  if (settled !== handle || query.isPending) {
    return { state: "checking", username: handle };
  }
  const res = query.data;
  if (query.isError || !res || res.status !== 200 || !res.data) {
    return { state: "failed", username: handle };
  }
  // The answer is for the handle as typed now (the key ignores case).
  switch (res.data.state) {
    case "available":
      return { state: "available", username: handle };
    case "taken":
      return {
        state: "taken",
        username: handle,
        suggestions: res.data.suggestions.slice(0, 3),
      };
    default:
      // "yours" (nothing to say) or "invalid" (the form says why).
      return { state: "idle" };
  }
}
