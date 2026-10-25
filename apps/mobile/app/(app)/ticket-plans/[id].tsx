import {
  EmailRequiredCard,
  useNeedsEmailToPay,
} from "@/components/account/EmailRequiredCard";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  PaymentChoiceList,
  usePaymentChoice,
} from "@/features/checkout/usePaymentChoice";
import {
  PlanProgressBlock,
  PlanStatusPill,
} from "@/features/ticketPlans/PlanBits";
import {
  useCancelTicketPlan,
  usePayTicketPlanPart,
  useTicketPlan,
} from "@/features/ticketPlans/useTicketPlans";
import { api } from "@/lib/api";
import { useQueryView } from "@/lib/useQueryView";
import type { PaymentMethodCode } from "@abonten/core/market/types";
import { paymentMethodLabel } from "@abonten/core/market/types";
import { currencyMinorFactor } from "@abonten/core/money/currencies";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { tryFromMajor } from "@abonten/core/money/money";
import { planMomentText } from "@abonten/core/ticketPlans/display";
import {
  daysUntil,
  isPlanOpen,
  suggestedPartAmounts,
} from "@abonten/core/ticketPlans/rules";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import type {
  TicketPlanDetail,
  TicketPlanEndReason,
} from "@abonten/types/ticketPlanType";
import {
  AppText,
  BottomBar,
  Button,
  Chip,
  Input,
  KeyboardAwareScrollView,
  Spinner,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, View } from "react-native";

// One Pay small small plan (docs/architecture/ticket-plans.md): what is
// paid and what is left, paying the next part (the same wallet list and
// payment screen as a checkout), the parts so far, and ending the plan.
// Coming back from the payment screen, the plan is read again.

const ENDED_KEY: Record<TicketPlanEndReason, string> = {
  hold_expired: "endedHoldExpired",
  deadline: "endedDeadline",
  buyer: "endedBuyer",
  event_cancelled: "endedEventCancelled",
  account_closed: "endedAccountClosed",
  admin: "endedAdmin",
};

export default function TicketPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations("ticketPlans");
  const tc = useTranslations("core");
  const { locale } = useLocale();
  const toast = useToast();
  const router = useRouter();
  const query = useTicketPlan(id);
  const view = useQueryView(query);
  const plan: TicketPlanDetail | null =
    query.data?.status === 200 ? (query.data.data ?? null) : null;
  const pay = usePayTicketPlanPart(id);
  const cancel = useCancelTicketPlan(id);
  const needsEmail = useNeedsEmailToPay();
  const payment = usePaymentChoice(
    plan?.nextPart ? { kind: "plan", planId: id } : null,
  );
  const [amountText, setAmountText] = useState("");
  const [chosenMinor, setChosenMinor] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back from the payment screen (or the app): read the plan again.
  useFocusEffect(
    useCallback(() => {
      void query.refetch();
    }, [query.refetch]),
  );

  const header = (
    <AppHeader
      variant="title"
      title={t("paySmallSmall")}
      backFallback="/(app)/balance"
    />
  );

  if (!plan) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <QueryUnavailable
          view={view}
          subject={t("thisPlan")}
          onRetry={() => void query.refetch()}
          loading={
            <View className="flex-1 items-center justify-center">
              <Spinner />
            </View>
          }
        />
      </View>
    );
  }

  const say = (amountMinor: number) =>
    formatMoney({ amountMinor, currency: plan.currency }, { locale });
  const deadline = planMomentText(plan.deadlineAt, plan.timezone, locale);
  const bounds = plan.nextPart;
  const factor = currencyMinorFactor(plan.currency);
  const typedMinor = amountText.trim()
    ? (tryFromMajor(amountText.trim(), plan.currency)?.amountMinor ??
      Number.NaN)
    : null;
  const selectedMinor = typedMinor ?? chosenMinor;
  const amountProblem =
    selectedMinor == null || !bounds
      ? null
      : !Number.isInteger(selectedMinor) || selectedMinor <= 0
        ? t("enterAValidAmount")
        : selectedMinor < bounds.minMinor
          ? t("payAtLeast", { amount: say(bounds.minMinor) })
          : selectedMinor > bounds.maxMinor
            ? t("onlyLeft", { amount: say(bounds.maxMinor) })
            : null;
  const canPay =
    !!bounds &&
    !plan.pendingAttemptId &&
    !needsEmail &&
    selectedMinor != null &&
    !amountProblem &&
    !!payment.choice;

  async function onPay() {
    if (!canPay || selectedMinor == null || !payment.choice || !plan) return;
    setError(null);
    const res = await pay.mutateAsync({
      amountMinor: selectedMinor,
      paymentMethodId: payment.choice.paymentMethodId,
      method: payment.choice.method,
    });
    if (res.status !== 200) {
      setError(res.message ?? t("couldNotStartPayment"));
      return;
    }
    const ps = res.data.payment;
    router.push({
      pathname: "/(app)/payment/[attemptId]",
      params: {
        attemptId: res.data.attemptId,
        kind: "ticket_plan",
        mode: ps.mode,
        deepLink: `abonten://ticket-plans/${plan.id}`,
        contextTitle: plan.eventTitle,
        amountLabel: say(selectedMinor),
        successBack: "1",
        successCtaLabel: t("backToYourPlan"),
        ...(ps.mode === "popup"
          ? { authorizationUrl: ps.authorizationUrl }
          : ps.mode === "redirect"
            ? { authorizationUrl: ps.url }
            : {
                chargeStatus: ps.chargeStatus,
                displayMessage: ps.displayMessage,
              }),
      },
    });
    setChosenMinor(null);
    setAmountText("");
  }

  async function checkPending() {
    if (!plan?.pendingAttemptId || checking) return;
    setChecking(true);
    try {
      const res = await api.payments.verify(plan.pendingAttemptId);
      if (res.status === 200) toast.success(t("paymentReceived"));
      else if (res.status === 202) toast.info(t("paymentStillConfirming"));
      else if (res.message) toast.error(res.message);
    } catch {
      toast.error(t("networkError"));
    } finally {
      setChecking(false);
      void query.refetch();
    }
  }

  function confirmCancel() {
    if (!plan) return;
    const body =
      plan.paidMinor === 0
        ? t("cancelBodyNothingPaid")
        : plan.refundIfEnded.keptMinor > 0
          ? t("cancelBodyKeepsFee", {
              refund: say(plan.refundIfEnded.refundMinor),
              kept: say(plan.refundIfEnded.keptMinor),
            })
          : t("cancelBodyFullRefund", {
              refund: say(plan.refundIfEnded.refundMinor),
            });
    Alert.alert(t("cancelTitle"), body, [
      { text: t("keepPaying"), style: "cancel" },
      {
        text: t("cancelConfirm"),
        style: "destructive",
        onPress: () => {
          void cancel.mutateAsync().then((res) => {
            if (res.status === 200)
              toast.success(res.message ?? t("planCancelled"));
            else toast.error(res.message ?? t("couldNotCancel"));
          });
        },
      },
    ]);
  }

  const open = isPlanOpen(plan.status);

  return (
    <View className="flex-1 bg-background">
      {header}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3 rounded-2xl border border-border bg-card p-4">
          <View className="gap-1">
            <AppText variant="cardTitle">{plan.eventTitle}</AppText>
            <AppText variant="meta">
              {planMomentText(plan.eventStartsAt, plan.timezone, locale)}
            </AppText>
          </View>
          <PlanStatusPill
            status={plan.status}
            refundStatus={plan.refundStatus}
          />
          <PlanProgressBlock
            paidMinor={plan.paidMinor}
            totalMinor={plan.totalMinor}
            currency={plan.currency}
          />
          <StatusLine plan={plan} deadline={deadline} say={say} />
        </View>

        {plan.status === "completed" ? (
          <View className="gap-3 rounded-2xl border border-success/40 bg-card p-4">
            <AppText variant="bodyStrong">{t("ticketsReady")}</AppText>
            <AppText variant="meta">{t("ticketsReadyBody")}</AppText>
            <Button
              title={t("seeMyTickets")}
              onPress={() => router.push("/(app)/tickets")}
            />
          </View>
        ) : null}

        {plan.pendingAttemptId ? (
          <View className="gap-3 rounded-2xl border border-border bg-card p-4">
            <AppText variant="small">{t("pendingPayment")}</AppText>
            <Button
              title={t("checkNow")}
              variant="outline"
              loading={checking}
              disabled={checking}
              onPress={checkPending}
            />
          </View>
        ) : null}

        {bounds && !plan.pendingAttemptId ? (
          <View className="gap-3">
            <View className="gap-1">
              <AppText variant="sectionHeading">
                {plan.paidMinor === 0 ? t("payFirstPart") : t("payMore")}
              </AppText>
              <AppText variant="meta">
                {bounds.minMinor === bounds.maxMinor
                  ? t("lastPartIs", { amount: say(bounds.maxMinor) })
                  : t("anyAmountBetween", {
                      min: say(bounds.minMinor),
                      max: say(bounds.maxMinor),
                    })}
              </AppText>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {suggestedPartAmounts(bounds, factor).map((minor) => (
                <Chip
                  key={minor}
                  label={
                    minor === bounds.maxMinor
                      ? t("payTheRest", { amount: say(minor) })
                      : say(minor)
                  }
                  selected={amountText === "" && chosenMinor === minor}
                  onPress={() => {
                    setChosenMinor(minor);
                    setAmountText("");
                  }}
                />
              ))}
            </View>
            <View className="gap-1">
              <AppText variant="caption">
                {t("orEnterAnAmount", { currency: plan.currency })}
              </AppText>
              <Input
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                accessibilityLabel={t("orEnterAnAmount", {
                  currency: plan.currency,
                })}
              />
              {amountProblem ? (
                <AppText variant="caption" tone="error">
                  {amountProblem}
                </AppText>
              ) : null}
            </View>
            {needsEmail ? (
              <EmailRequiredCard purpose="tickets" />
            ) : (
              <PaymentChoiceList state={payment} />
            )}
          </View>
        ) : null}

        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <AppText variant="overline">{t("whatYouArePayingFor")}</AppText>
          {plan.lines.map((line) => (
            <Row
              key={line.ticketTypeId}
              label={t("lineTickets", {
                count: line.quantity,
                tier: ticketTypeLabel(tc, line.tier),
              })}
              value={say(line.amountMinor)}
            />
          ))}
          <Row label={t("serviceFee")} value={say(plan.feeMinor)} muted />
          {plan.taxMinor > 0 ? (
            <Row label={t("tax")} value={say(plan.taxMinor)} muted />
          ) : null}
          <View className="my-1 h-px bg-border" />
          <Row label={t("total")} value={say(plan.totalMinor)} strong />
        </View>

        {plan.parts.length > 0 ? (
          <View className="gap-2 rounded-2xl border border-border bg-card p-4">
            <AppText variant="overline">{t("paymentsSoFar")}</AppText>
            {plan.parts.map((part) => (
              <View
                key={part.id}
                className="flex-row justify-between gap-3 py-1"
              >
                <View className="flex-1">
                  <AppText variant="small">
                    {planMomentText(part.paidAt, plan.timezone, locale)}
                  </AppText>
                  {part.method ? (
                    <AppText variant="caption">
                      {paymentMethodLabel(tc, part.method as PaymentMethodCode)}
                    </AppText>
                  ) : null}
                </View>
                <View className="items-end">
                  <AppText variant="small" className="font-semibold">
                    {say(part.amountMinor)}
                  </AppText>
                  {part.refundMinor > 0 ? (
                    <AppText variant="caption">
                      {part.refundStatus === "processed"
                        ? t("partRefunded", { amount: say(part.refundMinor) })
                        : part.refundStatus === "failed"
                          ? t("partRefundProblem")
                          : t("partRefunding", {
                              amount: say(part.refundMinor),
                            })}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {open && plan.status !== "settling" ? (
          <View className="gap-2">
            <AppText variant="caption">
              {plan.keepFeeOnRefund
                ? t("termNotFinishedKeepsFee", { deadline })
                : t("termNotFinishedFullRefund", { deadline })}
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={confirmCancel}
              disabled={cancel.isPending}
              hitSlop={8}
              className="self-start py-1 active:opacity-60"
            >
              <AppText variant="small" tone="error" className="font-semibold">
                {t("cancelPlan")}
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      {bounds && !plan.pendingAttemptId ? (
        <BottomBar>
          {error ? (
            <View className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <AppText className="text-sm text-destructive">{error}</AppText>
            </View>
          ) : null}
          <Button
            title={
              selectedMinor != null && !amountProblem
                ? t("payAmount", { amount: say(selectedMinor) })
                : t("chooseAnAmount")
            }
            fullWidth
            loading={pay.isPending}
            disabled={!canPay || pay.isPending}
            onPress={onPay}
          />
        </BottomBar>
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <AppText
        variant={strong ? "bodyStrong" : "small"}
        tone={muted ? "muted" : undefined}
        className="flex-1"
      >
        {label}
      </AppText>
      <AppText
        variant={strong ? "bodyStrong" : "small"}
        tone={muted ? "muted" : undefined}
      >
        {value}
      </AppText>
    </View>
  );
}

function StatusLine({
  plan,
  deadline,
  say,
}: {
  plan: TicketPlanDetail;
  deadline: string;
  say: (minor: number) => string;
}) {
  const t = useTranslations("ticketPlans");
  const { locale } = useLocale();
  switch (plan.status) {
    case "awaiting_payment":
      return (
        <AppText variant="small">
          {t("holdUntil", {
            time: planMomentText(plan.holdExpiresAt, plan.timezone, locale),
            deadline,
          })}
        </AppText>
      );
    case "active":
      return (
        <AppText variant="small">
          {t("finishBy", {
            left: say(plan.totalMinor - plan.paidMinor),
            deadline,
            days: daysUntil(new Date(plan.deadlineAt)),
          })}
        </AppText>
      );
    case "settling":
      return <AppText variant="small">{t("issuingTickets")}</AppText>;
    case "completed":
      return <AppText variant="small">{t("fullyPaid")}</AppText>;
    default:
      return (
        <View className="gap-1">
          {plan.endedReason ? (
            <AppText variant="small">{t(ENDED_KEY[plan.endedReason])}</AppText>
          ) : null}
          {plan.refundMinor > 0 ? (
            <AppText variant="meta">
              {plan.refundStatus === "refunded"
                ? t("refundDone", { amount: say(plan.refundMinor) })
                : plan.refundStatus === "failed"
                  ? t("refundProblem")
                  : t("refundOnItsWay", { amount: say(plan.refundMinor) })}
            </AppText>
          ) : null}
          {plan.keptMinor > 0 ? (
            <AppText variant="meta">
              {t("feeKept", { amount: say(plan.keptMinor) })}
            </AppText>
          ) : null}
        </View>
      );
  }
}
