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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("messaging");

  const [text, setText] = useState("");

  useEffect(() => {
    setText(message?.content ?? "");
  }, [message]);

  return (
    <Dialog open={!!message} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editMessage")}</DialogTitle>
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
            {t("cancel")}
          </Button>
          <Button
            onClick={() => onSave(text.trim())}
            disabled={
              saving || !text.trim() || text.trim() === message?.content
            }
          >
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
