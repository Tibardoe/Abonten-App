"use client";

import { getBlockedAccounts } from "@/actions/getBlockedAccounts";
import { setUserBlock } from "@/actions/setUserBlock";
import { useConfirm } from "@/hooks/useConfirm";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";

// Block / Unblock on someone's profile, beside Report. Until 2026-11-06 a
// person could only be blocked from one of their reviews or a chat, and
// pilot testers could not find a way to block someone they had no review
// from. A block is account-wide (user_block_set): no messages either way,
// their reviews, Spotlights and comments hidden from you, any follow
// between you ended. Hidden for signed-out visitors and on your own
// profile, like ReportButton. The state is the Settings › Blocked accounts
// list (same query), so the two always agree.

const BLOCKED_KEY = ["blocked-accounts"];

export default function ProfileBlockButton({
  userId,
  name,
  className,
}: {
  userId: string;
  /** How the person is named in the button and messages: "@ama". */
  name: string;
  className?: string;
}) {
  const t = useTranslations("profile");
  const { data: user } = useCurrentUser();
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();

  const blocked = useQuery({
    queryKey: BLOCKED_KEY,
    enabled: !!user,
    queryFn: async () => {
      const res = await getBlockedAccounts();
      if (res.status !== 200) throw new Error(res.message);
      return res.data ?? [];
    },
  });
  const isBlocked = !!blocked.data?.some((a) => a.userId === userId);

  const toggle = useMutation({
    mutationFn: async (block: boolean) => {
      const res = await setUserBlock({ userId, block });
      if (res.status !== 200) throw new Error(res.message ?? "");
    },
    onSuccess: (_data, block) => {
      toast.success(
        block ? t("userBlocked", { name }) : t("userUnblocked", { name }),
      );
      queryClient.invalidateQueries({ queryKey: BLOCKED_KEY });
      // Their reviews leave the lists; the ended follow and the hidden
      // Spotlights show at once.
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      queryClient.invalidateQueries({ queryKey: ["content"] });
    },
    onError: (error, block) =>
      toast.error(
        error.message ||
          (block
            ? t("couldNotBlockUser", { name })
            : t("couldNotUnblockUser", { name })),
      ),
  });

  if (!user || user.id === userId) return null;
  // Without the list the button cannot say which way it goes.
  if (!blocked.data) return null;

  const onClick = async () => {
    if (isBlocked) {
      toggle.mutate(false);
      return;
    }
    const confirmed = await confirm({
      title: t("blockUserQuestion", { name }),
      message: t("blockUserExplained"),
      confirmLabel: t("blockConfirm"),
    });
    if (confirmed) toggle.mutate(true);
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={toggle.isPending}
      className={
        className ??
        "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive disabled:opacity-60"
      }
    >
      <Ban className="h-4 w-4" />
      {isBlocked ? t("unblockUser", { name }) : t("blockUser", { name })}
    </button>
  );
}
