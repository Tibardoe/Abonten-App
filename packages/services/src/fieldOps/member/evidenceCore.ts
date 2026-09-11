import { randomUUID } from "node:crypto";
import type {
  FieldOpsEvidenceKind,
  FieldOpsEvidenceUploadTicket,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import { type FieldOpsEnvelope, dbErr, pointWkt } from "../shared/fieldOpsRows";
import { EVIDENCE_BUCKET } from "../shared/onboardingRows";

// Evidence photos (storefront, interior, owner consent) go straight from
// the member's browser into the private fieldops-evidence bucket with a
// signed upload URL the service mints here -- after checking the caller
// owns the draft. The service confirms the object exists at submission.

const FIELD_ROLES = ["offline_member", "online_member"] as const;
const MAX_EVIDENCE = 8;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export type EvidenceRequestInput = {
  campaignId: string;
  onboardingId: string;
  kind: FieldOpsEvidenceKind;
  mimeType: string;
  sizeBytes: number;
  capturedAt?: string | null;
  location?: { lat: number; lng: number } | null;
  accuracyM?: number | null;
};

export async function requestEvidenceUploadCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: EvidenceRequestInput,
): Promise<FieldOpsEnvelope<FieldOpsEvidenceUploadTicket>> {
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    requireMembership(ctx, input.campaignId, FIELD_ROLES);
  } catch (e) {
    return fieldOpsError(e);
  }
  const { data: row } = await supabase
    .from("fieldops_onboarding")
    .select("id, status, campaign_id")
    .eq("id", input.onboardingId)
    .eq("campaign_id", input.campaignId)
    .eq("member_user_id", userId)
    .maybeSingle();
  if (!row) return { status: 404, message: "Onboarding not found" };
  if (row.status !== "draft" && row.status !== "needs_changes") {
    return {
      status: 409,
      message: "This onboarding has already been submitted.",
    };
  }
  const { count } = await supabase
    .from("fieldops_onboarding_evidence")
    .select("id", { count: "exact", head: true })
    .eq("onboarding_id", row.id);
  if ((count ?? 0) >= MAX_EVIDENCE) {
    return { status: 409, message: `At most ${MAX_EVIDENCE} evidence photos.` };
  }
  const ext = EXT[input.mimeType];
  if (!ext)
    return { status: 400, message: "Use a JPEG, PNG, WebP or HEIC photo." };
  const path = `${row.campaign_id}/${row.id}/${randomUUID()}.${ext}`;

  const { data: inserted, error } = await supabase
    .from("fieldops_onboarding_evidence")
    .insert({
      onboarding_id: row.id,
      kind: input.kind,
      storage_path: path,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      captured_at: input.capturedAt ?? null,
      captured_location: input.location ? pointWkt(input.location) : null,
      accuracy_m:
        input.accuracyM === null || input.accuracyM === undefined
          ? null
          : Math.round(input.accuracyM),
      uploaded_by: userId,
    } as never)
    .select("id")
    .single();
  if (error || !inserted) {
    return dbErr(
      error ?? { message: "insert failed" },
      "Could not prepare the upload",
    );
  }
  const { data: signed, error: signErr } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUploadUrl(path);
  if (signErr || !signed) {
    await supabase
      .from("fieldops_onboarding_evidence")
      .delete()
      .eq("id", inserted.id);
    return { status: 500, message: "Could not prepare the upload. Try again." };
  }
  return {
    status: 200,
    data: {
      evidenceId: inserted.id,
      bucket: EVIDENCE_BUCKET,
      path,
      token: signed.token,
    },
  };
}

export async function removeEvidenceCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; onboardingId: string; evidenceId: string },
): Promise<FieldOpsEnvelope<{ removed: boolean }>> {
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    requireMembership(ctx, input.campaignId, FIELD_ROLES);
  } catch (e) {
    return fieldOpsError(e);
  }
  const { data: row } = await supabase
    .from("fieldops_onboarding")
    .select("id, status")
    .eq("id", input.onboardingId)
    .eq("campaign_id", input.campaignId)
    .eq("member_user_id", userId)
    .maybeSingle();
  if (!row) return { status: 404, message: "Onboarding not found" };
  if (row.status !== "draft" && row.status !== "needs_changes") {
    return {
      status: 409,
      message: "Evidence can't be changed after submission.",
    };
  }
  const { data: ev } = await supabase
    .from("fieldops_onboarding_evidence")
    .select("id, storage_path")
    .eq("id", input.evidenceId)
    .eq("onboarding_id", row.id)
    .maybeSingle();
  if (!ev) return { status: 404, message: "Photo not found" };
  await supabase.storage.from(EVIDENCE_BUCKET).remove([ev.storage_path]);
  const { error } = await supabase
    .from("fieldops_onboarding_evidence")
    .delete()
    .eq("id", ev.id);
  if (error) return dbErr(error, "Could not remove the photo");
  return { status: 200, message: "Photo removed.", data: { removed: true } };
}
