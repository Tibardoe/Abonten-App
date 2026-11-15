"use client";

import { findTicketTransferRecipient } from "@/actions/ticketTransfers/findTicketTransferRecipient";
import { getTicketTransferState } from "@/actions/ticketTransfers/getTicketTransferState";
import { sendTicket } from "@/actions/ticketTransfers/sendTicket";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { buildAvatarUrl } from "@abonten/core/cloudinaryUrl";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { personName } from "@abonten/core/personName";
import { ticketSendBlockMessageKey } from "@abonten/core/ticketTransfers/sendBlock";
import type {
  SendTicketTarget,
  TicketTransferRecipient,
} from "@abonten/types/ticketTransferType";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  TICKET_TRANSFERS_KEY,
  useRefreshAfterTransfer,
} from "../useTicketTransfers";

type Mode = "username" | "phone";

/**
 * Send one ticket to a friend: by username (their public name and photo
 * show before sending) or by phone number (only masked, never said to
 * belong to anyone). The ticket stays the sender's until the friend
 * accepts it.
 */
export default function SendTicketDialog({
  open,
  onOpenChange,
  ticketId,
  eventTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  eventTitle: string;
}) {
  const t = useTranslations("tickets");
  const tc = useTranslations("core");
  const toast = useToast();
  const refresh = useRefreshAfterTransfer();

  const [mode, setMode] = useState<Mode>("username");
  const [value, setValue] = useState("");
  const [recipient, setRecipient] = useState<TicketTransferRecipient | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The organizer may have switched sending off, or the ticket may have
  // moved the most times allowed: say so before asking who to send it to.
  const { data: state } = useQuery({
    queryKey: [...TICKET_TRANSFERS_KEY, "state", ticketId],
    enabled: open,
    queryFn: async () => {
      const res = answerOrThrow(await getTicketTransferState({ ticketId }));
      return res.status === 200 && "data" in res && res.data ? res.data : null;
    },
    staleTime: 15_000,
  });
  const blockKey = ticketSendBlockMessageKey(state?.block ?? null);

  useEffect(() => {
    if (open) {
      setMode("username");
      setValue("");
      setRecipient(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const target = (): SendTicketTarget =>
    mode === "username"
      ? { kind: "username", username: value }
      : { kind: "phone", phone: value };

  const find = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    const res = await findTicketTransferRecipient({ target: target() }).catch(
      actionUnreachable,
    );
    setBusy(false);
    if (res.status === 200 && "data" in res && res.data) {
      setRecipient(res.data);
    } else {
      setRecipient(null);
      setError(res.message ?? t("couldNotSend"));
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await sendTicket({ ticketId, target: target() }).catch(
      actionUnreachable,
    );
    setBusy(false);
    if (res.status === 200) {
      toast.success(t("ticketSentToast"));
      refresh();
      onOpenChange(false);
    } else {
      setError(res.message ?? t("couldNotSend"));
    }
  };

  const recipientName =
    recipient?.kind === "account"
      ? (personName(tc, {
          full_name: recipient.person.name,
          username: recipient.person.username,
        }) ?? "")
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sendTicketTitle")}</DialogTitle>
          <DialogDescription>
            {t("sendTicketBody", { title: eventTitle })}
          </DialogDescription>
        </DialogHeader>

        {blockKey ? (
          <p className="rounded-lg bg-muted p-3 text-sm">{t(blockKey)}</p>
        ) : recipient ? (
          <div className="space-y-3">
            {recipient.kind === "account" ? (
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Image
                  src={buildAvatarUrl(
                    recipient.person.avatarPublicId,
                    recipient.person.avatarVersion,
                    { width: 80, height: 80 },
                  )}
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-full"
                />
                <div className="min-w-0">
                  <p className="font-medium truncate">{recipientName}</p>
                  {recipient.person.username ? (
                    <p className="text-sm text-muted-foreground truncate">
                      @{recipient.person.username}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="font-medium">{recipient.phoneMasked}</p>
                <p className="text-sm text-muted-foreground">
                  {t("sendToPhoneHint")}
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {t("staysYoursUntilAccepted")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <fieldset className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <legend className="sr-only">{t("sendHow")}</legend>
              {(["username", "phone"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    mode === m
                      ? "bg-background shadow font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {m === "username" ? t("sendByUsername") : t("sendByPhone")}
                </button>
              ))}
            </fieldset>
            <Input
              autoFocus
              value={value}
              inputMode={mode === "phone" ? "tel" : "text"}
              autoComplete={mode === "phone" ? "tel" : "off"}
              placeholder={
                mode === "username"
                  ? t("usernamePlaceholder")
                  : t("phonePlaceholder")
              }
              aria-label={
                mode === "username" ? t("sendByUsername") : t("sendByPhone")
              }
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void find();
              }}
            />
          </div>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          {blockKey ? null : recipient ? (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setRecipient(null);
                  setError(null);
                }}
              >
                {t("change")}
              </Button>
              <Button disabled={busy} onClick={send}>
                {busy ? t("sending") : t("confirmSend")}
              </Button>
            </>
          ) : (
            <Button disabled={busy || !value.trim()} onClick={find}>
              {t("continue")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
