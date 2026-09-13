import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  deleteAccountCore,
  describeDeletionBlockers,
} from "./deleteAccountCore";

// The database side (account_deletion_blockers, anonymize_deleted_account)
// is covered by the integration suite; this checks the orchestration: a
// blocked person never reaches the auth deletion, and an allowed one is
// soft-deleted (never hard-deleted, which would cascade through the
// financial record).
function fakeClient(blockers: Record<string, unknown>) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "account_deletion_blockers") {
      return { data: blockers, error: null };
    }
    return { data: null, error: null };
  });
  const deleteUser = vi.fn(async () => ({ data: null, error: null }));
  const client = {
    rpc,
    auth: { admin: { deleteUser } },
  } as unknown as SupabaseClient<Database>;
  return { client, rpc, deleteUser };
}

const clear = {
  is_admin: false,
  upcoming_events_with_attendees: 0,
  payouts_in_flight: 0,
  balance_owed: 0,
};

describe("describeDeletionBlockers", () => {
  it("lets a person with nothing outstanding leave", () => {
    expect(describeDeletionBlockers(clear)).toBeNull();
  });

  it("names the step to take first, most consequential first", () => {
    expect(
      describeDeletionBlockers({ ...clear, upcoming_events_with_attendees: 2 }),
    ).toMatch(/cancel those events first/i);
    expect(
      describeDeletionBlockers({ ...clear, payouts_in_flight: 1 }),
    ).toMatch(/payout .* still being processed/i);
    expect(describeDeletionBlockers({ ...clear, balance_owed: 12.5 })).toMatch(
      /request a payout/i,
    );
    expect(describeDeletionBlockers({ ...clear, is_admin: true })).toMatch(
      /admin/i,
    );
  });

  it("ignores rounding dust in the balance", () => {
    expect(describeDeletionBlockers({ ...clear, balance_owed: 0.004 })).toBe(
      null,
    );
  });
});

describe("deleteAccountCore", () => {
  it("refuses with 409 and touches nothing when blocked", async () => {
    const { client, rpc, deleteUser } = fakeClient({
      ...clear,
      upcoming_events_with_attendees: 1,
    });
    const res = await deleteAccountCore("u1", { serviceClient: client });
    expect(res.status).toBe(409);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("closes credit, anonymises, then SOFT-deletes the auth user", async () => {
    const { client, rpc, deleteUser } = fakeClient(clear);
    const res = await deleteAccountCore("u1", { serviceClient: client });
    expect(res.status).toBe(200);
    const calls = rpc.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      "account_deletion_blockers",
      "credit_close_account",
      "anonymize_deleted_account",
    ]);
    expect(deleteUser).toHaveBeenCalledWith("u1", true);
  });

  it("stops before the auth deletion when anonymising fails", async () => {
    const { client, deleteUser } = fakeClient(clear);
    (client.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (name: string) => {
        if (name === "account_deletion_blockers") {
          return { data: clear, error: null };
        }
        if (name === "anonymize_deleted_account") {
          return { data: null, error: { message: "boom" } };
        }
        return { data: null, error: null };
      },
    );
    const res = await deleteAccountCore("u1", { serviceClient: client });
    expect(res.status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
