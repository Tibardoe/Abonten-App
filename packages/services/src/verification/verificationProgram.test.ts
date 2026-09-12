import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getVerificationProgramCore,
  isVerificationKillSwitchOn,
  requestsEnabledFor,
} from "./verificationProgram";

// Hand-rolled chainable Supabase stub, same idiom as paymentMethodCore.test.ts.
function fakeClient(opts: {
  setting?: Record<string, unknown> | null;
  settingError?: boolean;
  activeAdminIds?: string[];
}): ServiceRoleClient {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: self,
      maybeSingle: async () => {
        if (table === "verification_program_setting") {
          if (opts.settingError) {
            return { data: null, error: { message: "boom" } };
          }
          return { data: opts.setting ?? null, error: null };
        }
        if (table === "admin_user") {
          // `eq` was called with the user id; the stub keeps it simple by
          // answering from the captured id below.
          return {
            data:
              chain.__id &&
              (opts.activeAdminIds ?? []).includes(chain.__id as string)
                ? { user_id: chain.__id, status: "active" }
                : null,
            error: null,
          };
        }
        return { data: null, error: null };
      },
    });
    // capture the id passed to .eq("user_id", id)
    chain.eq = (col: string, value: unknown) => {
      if (col === "user_id") chain.__id = value;
      return chain;
    };
    return chain;
  };
  return { from } as unknown as ServiceRoleClient;
}

const FULL_SETTING = {
  place_requests_enabled: true,
  organizer_requests_enabled: true,
  audience: "all",
  beta_user_ids: [],
  organizer_types_enabled: ["business", "organisation", "individual"],
  max_evidence_files: 5,
  max_file_bytes: 10485760,
  retention_days_unapproved: 90,
  retention_days_after_revoke: 365,
  draft_expiry_days: 14,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verification programme gate", () => {
  it("is off when the settings row is missing", async () => {
    const program = await getVerificationProgramCore(
      fakeClient({ setting: null }),
      "user-1",
    );
    expect(program.placeRequestsEnabled).toBe(false);
    expect(program.organizerRequestsEnabled).toBe(false);
  });

  it("fails closed when the settings read errors", async () => {
    const program = await getVerificationProgramCore(
      fakeClient({ settingError: true }),
      "user-1",
    );
    expect(program.placeRequestsEnabled).toBe(false);
    expect(program.organizerRequestsEnabled).toBe(false);
  });

  it("the kill switch beats an all-on settings row", async () => {
    vi.stubEnv("VERIFICATION_KILL_SWITCH", "true");
    expect(isVerificationKillSwitchOn()).toBe(true);
    const program = await getVerificationProgramCore(
      fakeClient({ setting: FULL_SETTING }),
      "user-1",
    );
    expect(program.placeRequestsEnabled).toBe(false);
    expect(program.organizerRequestsEnabled).toBe(false);
  });

  it("opens to everyone on audience 'all'", async () => {
    const program = await getVerificationProgramCore(
      fakeClient({ setting: FULL_SETTING }),
      "user-1",
    );
    expect(program.placeRequestsEnabled).toBe(true);
    expect(program.organizerRequestsEnabled).toBe(true);
    expect(program.organizerTypes).toEqual([
      "business",
      "organisation",
      "individual",
    ]);
  });

  it("on audience 'staff' only an active admin is inside", async () => {
    const setting = { ...FULL_SETTING, audience: "staff" };
    const outsider = await getVerificationProgramCore(
      fakeClient({ setting, activeAdminIds: ["admin-1"] }),
      "user-1",
    );
    expect(outsider.placeRequestsEnabled).toBe(false);

    const staff = await getVerificationProgramCore(
      fakeClient({ setting, activeAdminIds: ["admin-1"] }),
      "admin-1",
    );
    expect(staff.placeRequestsEnabled).toBe(true);
  });

  it("on audience 'beta' the listed ids are inside", async () => {
    const setting = {
      ...FULL_SETTING,
      audience: "beta",
      beta_user_ids: ["beta-1"],
    };
    expect(
      (await getVerificationProgramCore(fakeClient({ setting }), "beta-1"))
        .placeRequestsEnabled,
    ).toBe(true);
    expect(
      (
        await getVerificationProgramCore(
          fakeClient({ setting }),
          "someone-else",
        )
      ).placeRequestsEnabled,
    ).toBe(false);
  });

  it("is off for an anonymous caller even when audience is 'all'", async () => {
    const program = await getVerificationProgramCore(
      fakeClient({ setting: FULL_SETTING }),
      null,
    );
    expect(program.placeRequestsEnabled).toBe(false);
  });

  it("drops organizer types the settings row does not recognise", async () => {
    const program = await getVerificationProgramCore(
      fakeClient({
        setting: {
          ...FULL_SETTING,
          organizer_types_enabled: ["business", "nonsense"],
        },
      }),
      "user-1",
    );
    expect(program.organizerTypes).toEqual(["business"]);
  });

  it("reports the switch for the right subject type", () => {
    const program = {
      placeRequestsEnabled: true,
      organizerRequestsEnabled: false,
      organizerTypes: [],
      maxEvidenceFiles: 5,
      maxFileBytes: 1,
    };
    expect(requestsEnabledFor(program, "place")).toBe(true);
    expect(requestsEnabledFor(program, "organizer")).toBe(false);
  });
});
