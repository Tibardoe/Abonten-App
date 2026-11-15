import { formatDateTime } from "@abonten/core/i18n/format";
import { personName } from "@abonten/core/personName";
import { ticketSendBlockMessageKey } from "@abonten/core/ticketTransfers/sendBlock";
import type {
  SendTicketTarget,
  TicketTransferRecipient,
} from "@abonten/types/ticketTransferType";
import {
  AppText,
  Avatar,
  Button,
  Icon,
  Input,
  SegmentedTabs,
  Sheet,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { View } from "react-native";
import {
  useAnswerTicketTransfer,
  useFindTicketRecipient,
  useSendTicket,
  useTicketTransferState,
  useTicketTransfers,
} from "./useTicketTransfers";

/**
 * On the ticket screen: "Send to a friend", or, while an offer is open,
 * who it is waiting for and "Take it back". Shown only for a live ticket
 * and only while the programme is open to the person; the server re-checks
 * every rule when sending.
 */
export function TicketSendPanel({
  ticketId,
  eventTitle,
  live,
}: {
  ticketId: string;
  eventTitle: string;
  live: boolean;
}) {
  const t = useTranslations("tickets");
  const tc = useTranslations("core");
  const { locale } = useLocale();
  const toast = useToast();
  const { data } = useTicketTransfers();
  const answer = useAnswerTicketTransfer();
  const [open, setOpen] = useState(false);

  const overview = data?.status === 200 ? data.data : undefined;
  const state = useTicketTransferState(
    ticketId,
    live && !!overview?.program.enabled,
  );
  const pending =
    overview?.outgoing.find((o) => o.ticketId === ticketId) ?? null;

  if (pending) {
    const who = pending.to
      ? (personName(tc, {
          full_name: pending.to.name,
          username: pending.to.username,
        }) ?? "")
      : (pending.toPhoneMasked ?? "");
    const takeBack = async () => {
      try {
        const res = await answer.mutateAsync({
          transferId: pending.id,
          action: "cancel",
        });
        if (res.status === 200) toast.success(t("takenBackToast"));
        else toast.error(res.message ?? t("couldNotSend"));
      } catch {
        toast.error(t("couldNotSend"));
      }
    };
    return (
      <View className="w-full gap-2 rounded-xl border border-border bg-card p-4">
        <View className="flex-row items-center gap-2">
          <Icon name="paper-plane-outline" size={18} tone="muted" />
          <AppText variant="bodyStrong" className="flex-1">
            {t("waitingFor", { name: who })}
          </AppText>
        </View>
        <AppText variant="meta">
          {t("acceptByThem", {
            date: formatDateTime(pending.expiresAt, locale),
          })}
        </AppText>
        {pending.toPhoneTexted === false ? (
          <AppText variant="caption" tone="warning">
            {t("notTextedHint")}
          </AppText>
        ) : null}
        <Button
          title={t("takeBack")}
          variant="outline"
          size="sm"
          loading={answer.isPending}
          disabled={answer.isPending}
          onPress={takeBack}
        />
      </View>
    );
  }

  if (!live || !overview?.program.enabled) return null;

  // The organizer may have switched sending off, or the ticket may have
  // moved the most times allowed: say so instead of a button that fails.
  const blockKey =
    state.data?.status === 200
      ? ticketSendBlockMessageKey(state.data.data?.block ?? null)
      : null;
  if (blockKey) {
    return (
      <View className="w-full flex-row items-center gap-2 rounded-xl border border-border bg-card p-4">
        <Icon name="paper-plane-outline" size={18} tone="muted" />
        <AppText variant="meta" className="flex-1">
          {t(blockKey)}
        </AppText>
      </View>
    );
  }

  return (
    <>
      <Button
        title={t("sendTicket")}
        variant="outline"
        fullWidth
        leftIcon="paper-plane-outline"
        onPress={() => setOpen(true)}
      />
      <SendTicketSheet
        open={open}
        onClose={() => setOpen(false)}
        ticketId={ticketId}
        eventTitle={eventTitle}
      />
    </>
  );
}

type Mode = "username" | "phone";

function SendTicketSheet({
  open,
  onClose,
  ticketId,
  eventTitle,
}: {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  eventTitle: string;
}) {
  const t = useTranslations("tickets");
  const tc = useTranslations("core");
  const toast = useToast();
  const find = useFindTicketRecipient();
  const send = useSendTicket();
  const [mode, setMode] = useState<Mode>("username");
  const [value, setValue] = useState("");
  const [recipient, setRecipient] = useState<TicketTransferRecipient | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setMode("username");
    setValue("");
    setRecipient(null);
    setError(null);
    onClose();
  };

  const target = (): SendTicketTarget =>
    mode === "username"
      ? { kind: "username", username: value }
      : { kind: "phone", phone: value };

  const onFind = async () => {
    if (!value.trim()) return;
    setError(null);
    try {
      const res = await find.mutateAsync(target());
      if (res.status === 200 && res.data) setRecipient(res.data);
      else setError(res.message ?? t("couldNotSend"));
    } catch {
      setError(t("couldNotSend"));
    }
  };

  const onSend = async () => {
    setError(null);
    try {
      const res = await send.mutateAsync({ ticketId, target: target() });
      if (res.status === 200) {
        toast.success(t("ticketSentToast"));
        close();
      } else {
        setError(res.message ?? t("couldNotSend"));
      }
    } catch {
      setError(t("couldNotSend"));
    }
  };

  const busy = find.isPending || send.isPending;
  const recipientName =
    recipient?.kind === "account"
      ? (personName(tc, {
          full_name: recipient.person.name,
          username: recipient.person.username,
        }) ?? "")
      : "";

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("sendTicketTitle")}
      onBack={recipient ? () => setRecipient(null) : undefined}
      footer={
        <View className="gap-2">
          {error ? (
            <View className="flex-row items-center gap-1.5">
              <Icon name="alert-circle" size={15} tone="destructive" />
              <AppText variant="small" tone="error" className="flex-1">
                {error}
              </AppText>
            </View>
          ) : null}
          {recipient ? (
            <Button
              title={send.isPending ? t("sending") : t("confirmSend")}
              loading={send.isPending}
              disabled={busy}
              onPress={onSend}
            />
          ) : (
            <Button
              title={t("continue")}
              loading={find.isPending}
              disabled={busy || !value.trim()}
              onPress={onFind}
            />
          )}
        </View>
      }
    >
      <View className="gap-4">
        <AppText variant="small" tone="muted">
          {t("sendTicketBody", { title: eventTitle })}
        </AppText>
        {recipient ? (
          <View className="gap-3">
            {recipient.kind === "account" ? (
              <View className="flex-row items-center gap-3 rounded-xl border border-border p-3">
                <Avatar
                  publicId={recipient.person.avatarPublicId}
                  version={recipient.person.avatarVersion}
                  size={44}
                />
                <View className="flex-1">
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {recipientName}
                  </AppText>
                  {recipient.person.username ? (
                    <AppText variant="meta" numberOfLines={1}>
                      @{recipient.person.username}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ) : (
              <View className="gap-1 rounded-xl border border-border p-3">
                <AppText variant="bodyStrong">{recipient.phoneMasked}</AppText>
                <AppText variant="meta">{t("sendToPhoneHint")}</AppText>
              </View>
            )}
            <AppText variant="small" tone="muted">
              {t("staysYoursUntilAccepted")}
            </AppText>
          </View>
        ) : (
          <View className="gap-3">
            <SegmentedTabs
              options={[
                { key: "username", label: t("sendByUsername") },
                { key: "phone", label: t("sendByPhone") },
              ]}
              value={mode}
              onChange={(next: Mode) => {
                setMode(next);
                setError(null);
              }}
            />
            <Input
              value={value}
              onChangeText={(text) => {
                setValue(text);
                setError(null);
              }}
              placeholder={
                mode === "username"
                  ? t("usernamePlaceholder")
                  : t("phonePlaceholder")
              }
              accessibilityLabel={
                mode === "username" ? t("sendByUsername") : t("sendByPhone")
              }
              keyboardType={mode === "phone" ? "phone-pad" : "default"}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={onFind}
            />
          </View>
        )}
      </View>
    </Sheet>
  );
}
