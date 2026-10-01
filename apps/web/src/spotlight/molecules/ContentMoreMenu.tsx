"use client";

import { deleteContentPost } from "@/actions/content/deleteContentPost";
import { getContentDownloadUrl } from "@/actions/content/getContentDownloadUrl";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { ReportDialog } from "@/components/organisms/ReportDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
import type { ContentPostDocument } from "@abonten/types/contentType";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { IoEllipsisHorizontal } from "react-icons/io5";
import { useContentProgram } from "../hooks/useContentProgram";
import { dataOf, messageOf } from "../lib/result";
import { contentShareUrl } from "../lib/share";

// The "…" menu on a post: copy link, download (only when the publisher
// allowed it and downloads are on), not interested, report, and delete for
// the author. Opening it pauses playback through onOpenChange.
export default function ContentMoreMenu({
  post,
  onNotInterested,
  onDeleted,
  onOpenChange,
  triggerClassName,
  extraItems = [],
}: {
  post: ContentPostDocument;
  /** Surface-specific entries, e.g. "Mute Stories from …". */
  extraItems?: { label: string; onSelect: () => void }[];
  onNotInterested?: () => void;
  onDeleted?: () => void;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
}) {
  const t = useTranslations("spotlight");

  const { data: user } = useCurrentUser();
  const { program } = useContentProgram();
  const toast = useToast();
  const qc = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Playback stays held while the menu or anything it opened is showing.
  const holding = menuOpen || reportOpen || confirmDelete;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to the hold changing
  useEffect(() => {
    onOpenChange?.(holding);
  }, [holding]);

  const isAuthor = post.viewer.isAuthor;
  const noun = post.kind === "story" ? t("story") : t("spotlight");
  const canDownload =
    post.kind === "spotlight" &&
    post.allowDownload &&
    program.spotlightDownloads;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(contentShareUrl(post.kind, post.id));
      toast.success(t("linkCopied"));
    } catch {
      toast.error(t("couldnTCopyTheLink"));
    }
  };

  const download = async () => {
    const res = await getContentDownloadUrl({ postId: post.id });
    const data = dataOf(res);
    if (!data) {
      toast.error(messageOf(res, t("thisCanTBeDownloaded")));
      return;
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  };

  const remove = async () => {
    setDeleting(true);
    const res = await deleteContentPost({ postId: post.id });
    setDeleting(false);
    setConfirmDelete(false);
    if (res.status !== 200) {
      toast.error(messageOf(res, t("couldnTDeleteThis", { noun: noun })));
      return;
    }
    toast.success(t("deleted2", { noun: noun }));
    qc.invalidateQueries({ queryKey: ["content"] });
    onDeleted?.();
  };

  return (
    <>
      <DropdownMenu onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          aria-label={t("moreOptions")}
          className={
            triggerClassName ??
            "rounded-full p-2 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          }
        >
          <IoEllipsisHorizontal className="text-xl" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={copyLink}>
            {t("copyLink")}
          </DropdownMenuItem>
          {canDownload ? (
            <DropdownMenuItem onSelect={download}>
              {t("download")}
            </DropdownMenuItem>
          ) : null}
          {extraItems.map((item) => (
            <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
              {item.label}
            </DropdownMenuItem>
          ))}
          {!isAuthor && user && post.kind === "spotlight" && onNotInterested ? (
            <DropdownMenuItem onSelect={onNotInterested}>
              {t("notInterested")}
            </DropdownMenuItem>
          ) : null}
          {!isAuthor && user ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => setReportOpen(true)}
              >
                {t("report", { noun: noun })}
              </DropdownMenuItem>
            </>
          ) : null}
          {isAuthor ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                {t("deleteText", { noun: noun })}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {reportOpen ? (
        <ReportDialog
          open
          onOpenChange={setReportOpen}
          targetType={post.kind}
          targetId={post.id}
          targetLabel={post.caption?.slice(0, 80) || noun}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDeleteModal
          title={t("deleteThis", { noun: noun })}
          message={t("itDisappearsForEveryoneStraightAway")}
          confirmLabel={t("deleteText2")}
          loadingLabel={t("deleting")}
          isLoading={deleting}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}
