"use client";

import { deleteEventReviewResponse } from "@/actions/deleteEventReviewResponse";
import { respondToEventReview } from "@/actions/respondToEventReview";
import { useToast } from "@/hooks/useToast";
import { patchReviewInData } from "@abonten/core/reviews/reviewCache";
import type { ReviewListRow } from "@abonten/core/reviews/reviewList";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

// The event organizer's Reply / Edit reply / Delete reply under a review of
// their own event. The reply shows in place at once and rolls back — with
// the typed text back in the box — if the server refuses it.
// respondToEventReview / deleteEventReviewResponse are the real
// authorization boundary (RLS + the column-guard trigger); this is only
// rendered for the organizer. Place owners reply from Manage › Reviews.
export default function OrganizerReplyControls({
  review,
  eventId,
}: {
  review: ReviewListRow;
  eventId: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const prefix = ["reviews", "event", eventId];

  const patch = (value: string | null) =>
    queryClient.setQueriesData({ queryKey: prefix }, (old: unknown) =>
      patchReviewInData(old, review.id, (r) => ({ ...r, response: value })),
    );

  const reply = useMutation({
    mutationFn: (text: string) => respondToEventReview(review.id, text),
    onMutate: async (text) => {
      setEditing(false);
      await queryClient.cancelQueries({ queryKey: prefix });
      const snapshot = queryClient.getQueriesData({ queryKey: prefix });
      patch(text);
      return { snapshot };
    },
    onSuccess: (res, text, context) => {
      if (res.status === 200) {
        setDraft(null);
        toast.success("Reply saved");
        queryClient.invalidateQueries({ queryKey: prefix });
        return;
      }
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error(res.message);
      setDraft(text);
      setEditing(true);
    },
    onError: (_e, text, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error("Something went wrong. Please try again.");
      setDraft(text);
      setEditing(true);
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteEventReviewResponse(review.id),
    onMutate: async () => {
      setConfirmingDelete(false);
      await queryClient.cancelQueries({ queryKey: prefix });
      const snapshot = queryClient.getQueriesData({ queryKey: prefix });
      patch(null);
      return { snapshot };
    },
    onSuccess: (res, _v, context) => {
      if (res.status === 200) {
        toast.success("Reply removed");
        queryClient.invalidateQueries({ queryKey: prefix });
        return;
      }
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error(res.message);
    },
    onError: (_e, _v, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error("Something went wrong. Please try again.");
    },
  });

  if (editing) {
    return (
      <ReplyForm
        initialText={draft ?? review.response ?? ""}
        isEdit={!!review.response}
        isSubmitting={reply.isPending}
        onCancel={() => {
          setEditing(false);
          setDraft(null);
        }}
        onSubmit={(text) => reply.mutate(text)}
      />
    );
  }

  if (!review.response) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-2 text-sm text-primary hover:underline"
      >
        Reply
      </button>
    );
  }

  return (
    <div className="mt-2 ml-4 md:ml-8 flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-primary hover:underline"
      >
        Edit reply
      </button>
      {confirmingDelete ? (
        <>
          <span className="text-muted-foreground">Remove this reply?</span>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
            className="text-destructive font-medium hover:underline disabled:opacity-60"
          >
            {remove.isPending ? "Removing…" : "Yes, remove"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            className="text-muted-foreground hover:underline"
          >
            Keep
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="text-destructive hover:underline"
        >
          Delete reply
        </button>
      )}
    </div>
  );
}

function ReplyForm({
  initialText,
  isEdit,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  initialText: string;
  isEdit: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);
  return (
    <div className="mt-3 ml-4 md:ml-8 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply to this review..."
        aria-label="Your reply"
        maxLength={500}
        className="w-full rounded-md border border-input bg-background p-2 text-sm"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSubmitting || !text.trim()}
          onClick={() => onSubmit(text.trim())}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : isEdit ? "Save changes" : "Post reply"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="border border-border px-3 py-1.5 rounded-md text-sm hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
