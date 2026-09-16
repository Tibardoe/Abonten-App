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
  const noun = post.kind === "story" ? "Story" : "Spotlight";
  const canDownload =
    post.kind === "spotlight" &&
    post.allowDownload &&
    program.spotlightDownloads;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(contentShareUrl(post.kind, post.id));
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const download = async () => {
    const res = await getContentDownloadUrl({ postId: post.id });
    const data = dataOf(res);
    if (!data) {
      toast.error(messageOf(res, "This can't be downloaded."));
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
      toast.error(messageOf(res, `Couldn't delete this ${noun}.`));
      return;
    }
    toast.success(`${noun} deleted.`);
    qc.invalidateQueries({ queryKey: ["content"] });
    onDeleted?.();
  };

  return (
    <>
      <DropdownMenu onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          aria-label="More options"
          className={
            triggerClassName ??
            "rounded-full p-2 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          }
        >
          <IoEllipsisHorizontal className="text-xl" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={copyLink}>Copy link</DropdownMenuItem>
          {canDownload ? (
            <DropdownMenuItem onSelect={download}>Download</DropdownMenuItem>
          ) : null}
          {extraItems.map((item) => (
            <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
              {item.label}
            </DropdownMenuItem>
          ))}
          {!isAuthor && user && post.kind === "spotlight" && onNotInterested ? (
            <DropdownMenuItem onSelect={onNotInterested}>
              Not interested
            </DropdownMenuItem>
          ) : null}
          {!isAuthor && user ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => setReportOpen(true)}
              >
                Report {noun}
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
                Delete {noun}
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
          title={`Delete this ${noun}?`}
          message="It disappears for everyone straight away. This can't be undone."
          confirmLabel="Delete"
          loadingLabel="Deleting…"
          isLoading={deleting}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}
