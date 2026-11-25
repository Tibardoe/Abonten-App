"use client";

import { checkUsernameAvailability } from "@/actions/checkUsernameAvailability";
import {
  normalizeUsernameInput,
  sameUsername,
  usernameProblem,
} from "@abonten/core/usernames/usernames";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export type UsernameCheckView =
  /** Nothing to say: empty, badly formed (the form says why) or unchanged. */
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; username: string }
  | { state: "taken"; username: string; suggestions: string[] }
  /** The check could not run (rate limit, offline): saving still works. */
  | { state: "failed" };

/**
 * "Is this username free?" while the person types (people and teams): asks
 * the server 450 ms after the typing stops, never for a badly formed
 * handle or the one the account already has. Saving still relies on the
 * database, which answers "taken" on a race.
 */
export function useUsernameAvailability(input: {
  username: string;
  /** The account's current handle: no check while it is unchanged. */
  current?: string | null;
  /** A team the person is an Owner of. */
  teamId?: string | null;
  /** The Make-a-team form. */
  forNewTeam?: boolean;
  /** The team name typed beside it (Make-a-team), for suggestions. */
  name?: string | null;
}): UsernameCheckView {
  const handle = normalizeUsernameInput(input.username);
  const [debounced, setDebounced] = useState(handle);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(handle), 450);
    return () => clearTimeout(timer);
  }, [handle]);

  const skip =
    !debounced ||
    usernameProblem(debounced) !== null ||
    (!!input.current && sameUsername(debounced, input.current));

  const query = useQuery({
    queryKey: [
      "username-check",
      debounced.toLowerCase(),
      input.teamId ?? null,
      input.forNewTeam === true,
    ],
    enabled: !skip,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await checkUsernameAvailability({
        username: debounced,
        teamId: input.teamId ?? null,
        forNewTeam: input.forNewTeam ?? false,
        name: input.name ?? null,
      });
      if (res.status !== 200 || !("data" in res) || !res.data) {
        throw new Error("message" in res ? res.message : "");
      }
      return res.data;
    },
  });

  if (!handle || usernameProblem(handle) !== null) return { state: "idle" };
  if (input.current && sameUsername(handle, input.current)) {
    return { state: "idle" };
  }
  if (handle !== debounced || query.isFetching) return { state: "checking" };
  if (query.isError) return { state: "failed" };
  const data = query.data;
  if (!data) return { state: "idle" };
  if (data.state === "available") {
    return { state: "available", username: data.username };
  }
  if (data.state === "taken") {
    return {
      state: "taken",
      username: data.username,
      suggestions: data.suggestions,
    };
  }
  return { state: "idle" };
}
