"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import {
  appointTeamOwnerAdminCore,
  setTeamStatusAdminCore,
  updateTeamSettingsCore,
} from "@abonten/services/admin/teams/teamsAdminCore";
import {
  appointTeamOwnerAdminSchema,
  teamSettingsSchema,
  teamStatusAdminSchema,
} from "@abonten/validation/teamSchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Teams (Admin › Teams) ─────────────
// Re-checked and audited in @abonten/services/admin/teams. The settings
// open team accounts to more people, so they sit behind a fresh re-auth
// like the other programme switches.

/** The programme switches and limits. teams.configure + step-up. */
export async function updateTeamSettings(input: unknown) {
  const parsed = teamSettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateTeamSettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/teams");
    return res;
  } catch (e) {
    return adminError(e, "updateTeamSettings");
  }
}

/** Pause a team (dispute, staff reason) or resume it. teams.manage + step-up. */
export async function setTeamStatus(input: unknown) {
  const parsed = teamStatusAdminSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setTeamStatusAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/teams/${parsed.data.teamId}`);
    return res;
  } catch (e) {
    return adminError(e, "setTeamStatus");
  }
}

/** Make a current or former member an Owner. teams.manage + step-up. */
export async function appointTeamOwner(input: unknown) {
  const parsed = appointTeamOwnerAdminSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await appointTeamOwnerAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/teams/${parsed.data.teamId}`);
    return res;
  } catch (e) {
    return adminError(e, "appointTeamOwner");
  }
}
