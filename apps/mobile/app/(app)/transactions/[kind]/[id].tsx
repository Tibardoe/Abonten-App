import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { DetailRowsSkeleton } from "@/components/skeletons";
import { useTransactionDetail } from "@/features/transactions/useTransactionDetail";
import { useQueryView } from "@/lib/useQueryView";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import { getRefundStatusLabel } from "@abonten/core/refundStatus";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import type { TransactionKind } from "@abonten/types/transactions";
import {
  AppText,
  Icon,
  Refresher,
  ScreenError,
  StatusPill,
  resolveStatus,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";

// Native echo of the web /transactions/[kind]/[id] page: an amount banner, a
// status banner, and a labelled detail block. Status wording, icon and tone
// come from the shared resolveStatus registry so this matches the
// transactions list, Finances and the ticket screen.

const STATUS_ICON_TONE: Record<
  string,
  "success" | "warning" | "destructive" | "primary" | "muted"
> = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  brand: "primary",
  neutral: "muted",
};

function Row({
  label,
  value,
}: { label: string; value: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <View className="flex-row items-start justify-between gap-4">
      <AppText variant="muted" className="shrink-0">
        {label}
      </AppText>
      {/* A long value (an order reference) wraps inside the card instead of
          running into the label and past the edge. */}
      <AppText variant="small" className="flex-1 text-right" selectable>
        {String(value)}
      </AppText>
    </View>
  );
}

function dt(value: string, locale: string) {
  const { date, time } = formatSingleDateTime(value, undefined, locale);
  return `${date} ${time}`;
}

export default function TransactionDetailScreen() {
  const t = useTranslations("transactions");
  const tc = useTranslations("core");
  const { locale } = useLocale();

  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const validKind =
    kind === "ticket" || kind === "subscription"
      ? (kind as TransactionKind)
      : undefined;
  const query = useTransactionDetail(validKind, id);
  const { data, refetch } = query;
  // Loading, offline and failed are told apart; `null` is the server's own
  // answer that no such transaction is visible to this person.
  const view = useQueryView(query);

  if (!validKind) return <ScreenError message={t("unknownTransactionType")} />;
  if (view.kind === "loading") return <DetailRowsSkeleton />;
  if (view.kind === "offline" || view.kind === "error") {
    return (
      <View className="flex-1 bg-background">
        <QueryUnavailable
          view={view}
          subject={t("thisTransaction")}
          onRetry={() => refetch()}
        />
      </View>
    );
  }
  if (data === null || data === undefined) {
    return <ScreenError message={t("thisTransactionCouldNotBeFound")} />;
  }

  const statusInfo = resolveStatus(data.status, { fallback: "pending" });
  const currency =
    (data.kind === "ticket"
      ? data.ticket_type?.currency
      : (data as { currency?: string | null }).currency) ?? "";
  const amount =
    data.kind === "ticket" && typeof data.totalPaid === "number"
      ? data.totalPaid
      : data.total_price;

  const contextualDate =
    data.status === "paid"
      ? data.completed_at
      : data.status === "pending"
        ? data.expires_at
        : data.created_at;
  const contextualLabel =
    data.status === "paid"
      ? t("completed")
      : data.status === "pending"
        ? t("expires")
        : t("date");

  const cancelled =
    data.kind === "ticket"
      ? data.tickets.filter((t) => t.status === "cancelled")
      : [];
  const refund =
    cancelled.length > 0 && cancelled[0].transaction
      ? getRefundStatusLabel(
          tc,
          cancelled[0].transaction.status,
          cancelled[0].transaction.refund_requested_at,
        )
      : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-16"
      refreshControl={<Refresher onRefresh={() => refetch()} />}
    >
      <View className="flex-row items-center justify-between rounded-xl bg-muted p-4">
        <AppText variant="bodyStrong" className="text-muted-foreground">
          {t("amount")}
        </AppText>
        <AppText variant="bodyStrong">
          {formatMoney(currency, Number(amount), { locale })}
        </AppText>
      </View>

      <View className="flex-row items-center gap-3 rounded-xl bg-muted p-4">
        <Icon
          name={statusInfo.icon}
          size={28}
          tone={STATUS_ICON_TONE[statusInfo.tone]}
        />
        <View>
          <AppText variant="bodyStrong">{statusInfo.label}</AppText>
          {contextualDate ? (
            <AppText variant="caption">
              {contextualLabel}: {dt(contextualDate, locale)}
            </AppText>
          ) : null}
        </View>
      </View>

      <View className="gap-3 rounded-xl bg-muted p-4">
        {data.kind === "ticket" ? (
          <>
            <Row label={t("event")} value={data.event?.title ?? null} />
            <Row
              label={t("ticketType2")}
              value={
                data.ticket_type?.type
                  ? ticketTypeLabel(tc, data.ticket_type.type)
                  : null
              }
            />
            <Row label={t("quantity")} value={data.quantity} />
            <Row
              label={t("unitPrice2")}
              value={formatMoney(currency, data.unit_price, { locale })}
            />
            {data.discount > 0 ? (
              <Row
                label={t("discount")}
                value={`-${formatMoney(currency, data.discount, { locale })}`}
              />
            ) : null}
            <Row
              label={t("ticketPrice2")}
              value={formatMoney(currency, data.total_price, { locale })}
            />
            {data.serviceFee > 0 ? (
              <Row
                label={t("serviceFee")}
                value={formatMoney(currency, data.serviceFee, { locale })}
              />
            ) : null}
            {data.totalPaid !== data.total_price ? (
              <Row
                label={t("totalPaid2")}
                value={formatMoney(currency, data.totalPaid, { locale })}
              />
            ) : null}
            <Row label={t("dateTime")} value={dt(data.created_at, locale)} />
            <Row
              label={t("orderReference2")}
              value={data.checkout_session_id ?? id}
            />
            {cancelled.length > 0 ? (
              <Row
                label={t("cancelled")}
                value={`${cancelled.length} of ${data.quantity}`}
              />
            ) : null}
            {refund ? <Row label={t("refund")} value={refund.label} /> : null}
          </>
        ) : (
          <>
            <Row label={t("plan")} value={data.subscription_plan_name} />
            <Row
              label={t("unitPrice2")}
              value={formatMoney(currency, data.unit_price, { locale })}
            />
            {data.discount > 0 ? (
              <Row
                label={t("discount")}
                value={`-${formatMoney(currency, data.discount, { locale })}`}
              />
            ) : null}
            <Row
              label={t("totalPrice2")}
              value={formatMoney(currency, data.total_price, { locale })}
            />
            <Row label={t("dateTime")} value={dt(data.created_at, locale)} />
            <Row label={t("reference")} value={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}
