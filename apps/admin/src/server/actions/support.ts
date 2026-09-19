"use server";

import { currentRequestMeta, requireAdmin } from "@/lib/adminGuard";
import { addAdminNoteCore } from "@abonten/services/admin/reports/reportsAdminCore";
import {
  assignSupportConversationCore,
  replySupportConversationCore,
  setSupportConversationStatusCore,
} from "@abonten/services/admin/support/supportAdminCore";
import {
  adminNoteSchema,
  supportAssignSchema,
  supportReplySchema,
  supportStatusSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

// ── In-app support queue ────────────────────────────────────

export async function assignSupportConversation(input: unknown) {
  const parsed = supportAssignSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await assignSupportConversationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/support/${parsed.data.conversationId}`);
      revalidatePath("/support");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function replySupportConversation(input: unknown) {
  const parsed = supportReplySchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await replySupportConversationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/support/${parsed.data.conversationId}`);
      revalidatePath("/support");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function setSupportConversationStatus(input: unknown) {
  const parsed = supportStatusSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await setSupportConversationStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/support/${parsed.data.conversationId}`);
      revalidatePath("/support");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function addSupportNote(input: unknown) {
  const parsed = adminNoteSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  if (parsed.data.targetType !== "support_conversation") {
    return { status: 400, message: "Invalid input" };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await addAdminNoteCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/support/${parsed.data.targetId}`);
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}
