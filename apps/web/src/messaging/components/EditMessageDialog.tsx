"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MESSAGE_MAX_LENGTH } from "@abonten/types/messagingType";
import type { MessageRow } from "@abonten/types/messagingType";
import { useEffect, useState } from "react";

export function EditMessageDialog({
  message,
  onClose,
  onSave,
  saving,
}: {
  message: MessageRow | null;
  onClose: () => void;
  onSave: (content: string) => void;
  saving: boolean;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText(message?.content ?? "");
  }, [message]);

  return (
    <Dialog open={!!message} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit message</DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MESSAGE_MAX_LENGTH}
          rows={4}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(text.trim())}
            disabled={
              saving || !text.trim() || text.trim() === message?.content
            }
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
