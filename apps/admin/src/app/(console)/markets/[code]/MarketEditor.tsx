"use client";

import { Badge, Button, Card, cn } from "@/components/ui";
import {
  runMarketReadiness,
  transitionMarket,
  updateMarket,
  upsertMarketPaymentMethod,
  upsertMarketPayoutMethod,
  upsertMarketProvider,
  upsertMarketRegion,
} from "@/server/actions/markets";
import type { ReadinessReport } from "@abonten/core/market/readiness";
import {
  MARKET_TRANSITIONS,
  type MarketTransition,
  availableTransitions,
} from "@abonten/core/market/transitions";
import {
  type MarketConfig,
  PAYMENT_METHOD_CODES,
  PAYMENT_METHOD_LABEL,
  PAYMENT_PROVIDER_CODES,
  type PaymentMethodCode,
  type PaymentProviderCode,
} from "@abonten/core/market/types";
import { CURRENCIES } from "@abonten/core/money/currencies";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";
const label = "flex flex-col gap-1 text-xs";

function Section({
  title,
  hint,
  children,
}: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint ? (
        <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </Card>
  );
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p
      className={cn(
        "mt-2 text-xs",
        msg.ok ? "text-success" : "text-destructive",
      )}
    >
      {msg.text}
    </p>
  );
}

type Msg = { ok: boolean; text: string } | null;

export function MarketEditor({
  market,
  canManage,
  canActivate,
  stepUpFresh,
  lastReadiness,
}: {
  market: MarketConfig;
  canManage: boolean;
  canActivate: boolean;
  stepUpFresh: boolean;
  lastReadiness: {
    ranAt: string;
    canActivate: boolean;
    report: ReadinessReport;
  } | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <OverviewForm market={market} canManage={canManage} />
        <TaxFeesLegalForm market={market} canManage={canManage} />
        <RegionsSection market={market} canManage={canManage} />
      </div>
      <div className="space-y-4">
        <ReadinessSection
          market={market}
          canActivate={canActivate}
          stepUpFresh={stepUpFresh}
          lastReadiness={lastReadiness}
        />
        <ProvidersSection market={market} canManage={canManage} />
        <PaymentMethodsSection market={market} canManage={canManage} />
        <PayoutMethodsSection market={market} canManage={canManage} />
      </div>
    </div>
  );
}

// ── Overview ───────────────────────────────────────────────

function OverviewForm({
  market,
  canManage,
}: { market: MarketConfig; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [name, setName] = useState(market.name);
  const [defaultCurrency, setDefaultCurrency] = useState(
    market.defaultCurrency,
  );
  const [supportedCurrencies, setSupportedCurrencies] = useState(
    market.supportedCurrencies.join(", "),
  );
  const [timeZone, setTimeZone] = useState(market.defaultTimeZone);
  const [locale, setLocale] = useState(market.defaultLocale);
  const [locales, setLocales] = useState(market.supportedLocales.join(", "));
  const [distanceUnit, setDistanceUnit] = useState<"km" | "mi">(
    market.distanceUnit,
  );
  const [dialCode, setDialCode] = useState(market.dialCode);
  const [otpProvider, setOtpProvider] = useState<"hubtel" | "twilio" | "">(
    market.otpProvider ?? "",
  );
  const [centreLat, setCentreLat] = useState(
    market.centre ? String(market.centre.lat) : "",
  );
  const [centreLng, setCentreLng] = useState(
    market.centre ? String(market.centre.lng) : "",
  );

  return (
    <Section
      title="Country"
      hint="Currency, time zone, locale and how phones are validated. Changing the default currency only affects new listings."
    >
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          start(async () => {
            const res = await updateMarket({
              countryCode: market.countryCode,
              name,
              defaultCurrency,
              supportedCurrencies: supportedCurrencies
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              defaultTimeZone: timeZone,
              defaultLocale: locale,
              supportedLocales: locales
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              distanceUnit,
              dialCode,
              otpProvider: otpProvider === "" ? null : otpProvider,
              centre:
                centreLat.trim() && centreLng.trim()
                  ? { lat: Number(centreLat), lng: Number(centreLng) }
                  : null,
            });
            setMsg({
              ok: res.status === 200,
              text: res.status === 200 ? "Saved." : (res.message ?? "Failed"),
            });
            if (res.status === 200) router.refresh();
          });
        }}
      >
        <label className={cn(label, "col-span-2")}>
          Name
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canManage}
          />
        </label>
        <label className={label}>
          Default currency
          <select
            className={input}
            value={defaultCurrency}
            onChange={(e) => setDefaultCurrency(e.target.value)}
            disabled={!canManage}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Supported currencies (comma-separated)
          <input
            className={input}
            value={supportedCurrencies}
            onChange={(e) => setSupportedCurrencies(e.target.value)}
            disabled={!canManage}
          />
        </label>
        <label className={label}>
          Default time zone
          <input
            className={input}
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            disabled={!canManage}
            placeholder="Africa/Lagos"
          />
        </label>
        <label className={label}>
          Dial code
          <input
            className={input}
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            disabled={!canManage}
            placeholder="+234"
          />
        </label>
        <label className={label}>
          Default locale
          <input
            className={input}
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            disabled={!canManage}
            placeholder="en-NG"
          />
        </label>
        <label className={label}>
          Supported locales (comma-separated)
          <input
            className={input}
            value={locales}
            onChange={(e) => setLocales(e.target.value)}
            disabled={!canManage}
          />
        </label>
        <label className={label}>
          Distance unit
          <select
            className={input}
            value={distanceUnit}
            onChange={(e) => setDistanceUnit(e.target.value as "km" | "mi")}
            disabled={!canManage}
          >
            <option value="km">Kilometres</option>
            <option value="mi">Miles</option>
          </select>
        </label>
        <label className={label}>
          Text-message codes (OTP)
          <select
            className={input}
            value={otpProvider}
            onChange={(e) =>
              setOtpProvider(e.target.value as "hubtel" | "twilio" | "")
            }
            disabled={!canManage}
          >
            <option value="">None (phone sign-in off)</option>
            <option value="hubtel">Hubtel (Ghana)</option>
            <option value="twilio">Twilio Verify</option>
          </select>
        </label>
        <label className={label}>
          Fallback centre latitude
          <input
            className={input}
            value={centreLat}
            onChange={(e) => setCentreLat(e.target.value)}
            disabled={!canManage}
          />
        </label>
        <label className={label}>
          Fallback centre longitude
          <input
            className={input}
            value={centreLng}
            onChange={(e) => setCentreLng(e.target.value)}
            disabled={!canManage}
          />
        </label>
        {canManage ? (
          <div className="col-span-2 flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save country"}
            </Button>
            <Msg msg={msg} />
          </div>
        ) : null}
      </form>
    </Section>
  );
}

// ── Tax, fees, legal ───────────────────────────────────────

function TaxFeesLegalForm({
  market,
  canManage,
}: { market: MarketConfig; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [mode, setMode] = useState(market.tax.mode);
  const [ratePct, setRatePct] = useState(String(market.tax.rateBps / 100));
  const [taxLabel, setTaxLabel] = useState(market.tax.label);
  const [taxNote, setTaxNote] = useState(market.tax.note ?? "");
  const [ackTax, setAckTax] = useState(false);
  const [feePct, setFeePct] = useState(
    market.fees.serviceFeeBps != null
      ? String(market.fees.serviceFeeBps / 100)
      : "",
  );
  const [termsVersion, setTermsVersion] = useState(
    market.legal.termsVersion ?? "",
  );
  const [supportEmail, setSupportEmail] = useState(
    market.legal.supportEmail ?? "",
  );
  const [ackLegal, setAckLegal] = useState(false);

  return (
    <Section
      title="Tax, fees and legal"
      hint="Tax rates are configuration, not advice: enter what counsel confirmed and acknowledge it. The service fee overrides the global platform rate for this market only."
    >
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          start(async () => {
            const res = await updateMarket({
              countryCode: market.countryCode,
              tax: {
                mode,
                rateBps: Math.round(Number(ratePct) * 100) || 0,
                label: taxLabel,
                note: taxNote || null,
                acknowledge: ackTax,
              },
              serviceFeeBps:
                feePct.trim() === "" ? null : Math.round(Number(feePct) * 100),
              legal: {
                termsVersion: termsVersion || null,
                supportEmail: supportEmail || null,
                acknowledge: ackLegal,
              },
            });
            setMsg({
              ok: res.status === 200,
              text: res.status === 200 ? "Saved." : (res.message ?? "Failed"),
            });
            if (res.status === 200) router.refresh();
          });
        }}
      >
        <label className={label}>
          Tax mode
          <select
            className={input}
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            disabled={!canManage}
          >
            <option value="none">No tax line</option>
            <option value="exclusive">Added on top (exclusive)</option>
            <option value="inclusive">Included in prices (inclusive)</option>
          </select>
        </label>
        <label className={label}>
          Rate (%)
          <input
            className={input}
            value={ratePct}
            onChange={(e) => setRatePct(e.target.value)}
            disabled={!canManage || mode === "none"}
          />
        </label>
        <label className={label}>
          Tax label on receipts
          <input
            className={input}
            value={taxLabel}
            onChange={(e) => setTaxLabel(e.target.value)}
            disabled={!canManage || mode === "none"}
            placeholder="VAT"
          />
        </label>
        <label className={label}>
          Registration / note
          <input
            className={input}
            value={taxNote}
            onChange={(e) => setTaxNote(e.target.value)}
            disabled={!canManage}
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={ackTax}
            onChange={(e) => setAckTax(e.target.checked)}
            disabled={!canManage}
          />
          I confirm this tax configuration with counsel
          {market.tax.acknowledgedAt ? (
            <span className="text-muted-foreground">
              (last acknowledged {market.tax.acknowledgedAt.slice(0, 10)})
            </span>
          ) : null}
        </label>
        <label className={label}>
          Service fee override (%)
          <input
            className={input}
            value={feePct}
            onChange={(e) => setFeePct(e.target.value)}
            disabled={!canManage}
            placeholder="blank = global rate"
          />
        </label>
        <label className={label}>
          Support email
          <input
            className={input}
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            disabled={!canManage}
          />
        </label>
        <label className={label}>
          Terms version
          <input
            className={input}
            value={termsVersion}
            onChange={(e) => setTermsVersion(e.target.value)}
            disabled={!canManage}
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={ackLegal}
            onChange={(e) => setAckLegal(e.target.checked)}
            disabled={!canManage}
          />
          Legal review for this market is complete
          {market.legal.acknowledgedAt ? (
            <span className="text-muted-foreground">
              (acknowledged {market.legal.acknowledgedAt.slice(0, 10)})
            </span>
          ) : null}
        </label>
        {canManage ? (
          <div className="col-span-2 flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Msg msg={msg} />
          </div>
        ) : null}
      </form>
    </Section>
  );
}

// ── Providers ──────────────────────────────────────────────

function ProvidersSection({
  market,
  canManage,
}: { market: MarketConfig; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [provider, setProvider] = useState<PaymentProviderCode>(
    market.paymentProviders[0]?.provider ?? "paystack",
  );
  const existing = market.paymentProviders.find((p) => p.provider === provider);
  const suffix = market.countryCode;
  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [secretEnv, setSecretEnv] = useState(
    existing?.credentials.secretKeyEnv ??
      `${provider.toUpperCase()}_${suffix}_SECRET_KEY`,
  );
  const [webhookEnv, setWebhookEnv] = useState(
    existing?.credentials.webhookSecretEnv ??
      `${provider.toUpperCase()}_${suffix}_WEBHOOK_SECRET`,
  );
  const [publicEnv, setPublicEnv] = useState(
    existing?.credentials.publicKeyEnv ?? "",
  );
  const [settlement, setSettlement] = useState(
    existing?.settlementCurrency ?? market.defaultCurrency,
  );
  const [currencies, setCurrencies] = useState(
    (existing?.currencies ?? [market.defaultCurrency]).join(", "),
  );
  const [payouts, setPayouts] = useState(existing?.payoutsEnabled ?? false);
  const [ref, setRef] = useState(existing?.providerAccountRef ?? "");

  function pick(code: PaymentProviderCode) {
    setProvider(code);
    const row = market.paymentProviders.find((p) => p.provider === code);
    setEnabled(row?.enabled ?? false);
    setSecretEnv(
      row?.credentials.secretKeyEnv ??
        `${code.toUpperCase()}_${suffix}_SECRET_KEY`,
    );
    setWebhookEnv(
      row?.credentials.webhookSecretEnv ??
        `${code.toUpperCase()}_${suffix}_WEBHOOK_SECRET`,
    );
    setPublicEnv(row?.credentials.publicKeyEnv ?? "");
    setSettlement(row?.settlementCurrency ?? market.defaultCurrency);
    setCurrencies((row?.currencies ?? [market.defaultCurrency]).join(", "));
    setPayouts(row?.payoutsEnabled ?? false);
    setRef(row?.providerAccountRef ?? "");
  }

  return (
    <Section
      title="Payment providers"
      hint="Each row is one provider ACCOUNT for this market. Enter the NAMES of the environment variables that hold its keys; the values live in the deployment, never here. Webhook URL: /api/payments/webhook/{provider}/{country}."
    >
      <ul className="mb-3 space-y-1 text-xs">
        {market.paymentProviders.map((p) => (
          <li key={p.provider} className="flex items-center gap-2">
            <Badge tone={p.enabled ? "success" : "neutral"}>
              {p.enabled ? "enabled" : "off"}
            </Badge>
            <span className="font-medium">{p.provider}</span>
            <span className="text-muted-foreground">
              settles {p.settlementCurrency} · accepts {p.currencies.join(", ")}{" "}
              · keys {p.credentials.secretKeyEnv},{" "}
              {p.credentials.webhookSecretEnv}
              {p.payoutsEnabled ? " · payouts on" : ""}
            </span>
          </li>
        ))}
        {market.paymentProviders.length === 0 ? (
          <li className="text-muted-foreground">No provider configured yet.</li>
        ) : null}
      </ul>
      {canManage ? (
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            start(async () => {
              const res = await upsertMarketProvider({
                countryCode: market.countryCode,
                provider,
                enabled,
                secretKeyEnv: secretEnv.trim(),
                webhookSecretEnv: webhookEnv.trim(),
                publicKeyEnv: publicEnv.trim() || null,
                settlementCurrency: settlement,
                currencies: currencies
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                payoutsEnabled: payouts,
                providerAccountRef: ref.trim() || null,
              });
              setMsg({
                ok: res.status === 200,
                text: res.message ?? (res.status === 200 ? "Saved." : "Failed"),
              });
              if (res.status === 200) router.refresh();
            });
          }}
        >
          <label className={label}>
            Provider
            <select
              className={input}
              value={provider}
              onChange={(e) => pick(e.target.value as PaymentProviderCode)}
            >
              {PAYMENT_PROVIDER_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-xs">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Enabled
          </label>
          <label className={label}>
            Secret key env var
            <input
              className={input}
              value={secretEnv}
              onChange={(e) => setSecretEnv(e.target.value)}
            />
          </label>
          <label className={label}>
            Webhook secret env var
            <input
              className={input}
              value={webhookEnv}
              onChange={(e) => setWebhookEnv(e.target.value)}
            />
          </label>
          <label className={label}>
            Public key env var (optional)
            <input
              className={input}
              value={publicEnv}
              onChange={(e) => setPublicEnv(e.target.value)}
            />
          </label>
          <label className={label}>
            Settlement currency
            <input
              className={input}
              value={settlement}
              onChange={(e) => setSettlement(e.target.value.toUpperCase())}
            />
          </label>
          <label className={label}>
            Accepted currencies (comma-separated)
            <input
              className={input}
              value={currencies}
              onChange={(e) => setCurrencies(e.target.value)}
            />
          </label>
          <label className={label}>
            Provider account reference
            <input
              className={input}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="business id / acct_…"
            />
          </label>
          <label className="col-span-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={payouts}
              onChange={(e) => setPayouts(e.target.checked)}
            />{" "}
            Automated payouts (provider transfers) allowed
          </label>
          <div className="col-span-2 flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save provider"}
            </Button>
            <Msg msg={msg} />
          </div>
        </form>
      ) : null}
    </Section>
  );
}

// ── Payment methods ────────────────────────────────────────

function PaymentMethodsSection({
  market,
  canManage,
}: { market: MarketConfig; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [provider, setProvider] = useState<PaymentProviderCode>(
    market.paymentProviders[0]?.provider ?? "paystack",
  );
  const [method, setMethod] = useState<PaymentMethodCode>("card");
  const [enabled, setEnabled] = useState(true);
  const [currencies, setCurrencies] = useState(market.defaultCurrency);
  const [platforms, setPlatforms] = useState("");
  const [recommended, setRecommended] = useState(false);

  return (
    <Section
      title="Customer payment methods"
      hint="What people here actually pay with. Only enabled methods on an enabled provider are offered, and only where the adapter can run them."
    >
      <ul className="mb-3 space-y-1 text-xs">
        {market.paymentMethods.map((pm) => (
          <li
            key={`${pm.provider}:${pm.method}`}
            className="flex items-center gap-2"
          >
            <Badge tone={pm.enabled ? "success" : "neutral"}>
              {pm.enabled ? "on" : "off"}
            </Badge>
            <span className="font-medium">
              {PAYMENT_METHOD_LABEL[pm.method]}
            </span>
            <span className="text-muted-foreground">
              via {pm.provider} · {pm.currencies.join(", ")}
              {pm.platforms.length ? ` · ${pm.platforms.join("/")}` : ""}
              {pm.recommended ? " · recommended" : ""}
            </span>
          </li>
        ))}
      </ul>
      {canManage ? (
        <form
          className="grid grid-cols-3 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            start(async () => {
              const res = await upsertMarketPaymentMethod({
                countryCode: market.countryCode,
                provider,
                method,
                enabled,
                currencies: currencies
                  .split(",")
                  .map((s) => s.trim().toUpperCase())
                  .filter(Boolean),
                platforms: platforms
                  .split(",")
                  .map((s) => s.trim())
                  .filter(
                    (s): s is "web" | "ios" | "android" =>
                      s === "web" || s === "ios" || s === "android",
                  ),
                recommended,
              });
              setMsg({
                ok: res.status === 200,
                text: res.message ?? (res.status === 200 ? "Saved." : "Failed"),
              });
              if (res.status === 200) router.refresh();
            });
          }}
        >
          <label className={label}>
            Provider
            <select
              className={input}
              value={provider}
              onChange={(e) =>
                setProvider(e.target.value as PaymentProviderCode)
              }
            >
              {PAYMENT_PROVIDER_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Method
            <select
              className={input}
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethodCode)}
            >
              {PAYMENT_METHOD_CODES.map((c) => (
                <option key={c} value={c}>
                  {PAYMENT_METHOD_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Currencies
            <input
              className={input}
              value={currencies}
              onChange={(e) => setCurrencies(e.target.value)}
            />
          </label>
          <label className={label}>
            Platforms (blank = all)
            <input
              className={input}
              value={platforms}
              onChange={(e) => setPlatforms(e.target.value)}
              placeholder="web, ios, android"
            />
          </label>
          <label className="flex items-center gap-2 self-end text-xs">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Enabled
          </label>
          <label className="flex items-center gap-2 self-end text-xs">
            <input
              type="checkbox"
              checked={recommended}
              onChange={(e) => setRecommended(e.target.checked)}
            />{" "}
            Recommended
          </label>
          <div className="col-span-3 flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save method"}
            </Button>
            <Msg msg={msg} />
          </div>
        </form>
      ) : null}
    </Section>
  );
}

// ── Payout methods ─────────────────────────────────────────

function PayoutMethodsSection({
  market,
  canManage,
}: { market: MarketConfig; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [method, setMethod] = useState<"mobile_money" | "bank">("bank");
  const [provider, setProvider] = useState<PaymentProviderCode | "">(
    market.paymentProviders[0]?.provider ?? "",
  );
  const [enabled, setEnabled] = useState(true);
  const [currency, setCurrency] = useState(market.defaultCurrency);
  const [automated, setAutomated] = useState(false);
  const [fieldsJson, setFieldsJson] = useState(
    JSON.stringify(
      market.payoutMethods.find((m) => m.method === "bank")?.fields ?? [
        { key: "bankName", label: "Bank", required: true },
        { key: "accountNumber", label: "Account number", required: true },
      ],
      null,
      2,
    ),
  );

  return (
    <Section
      title="Organizer payouts"
      hint="Rails organizers can be paid on, with the account fields each needs (JSON: key, label, required, pattern, example). Manual settlement is the default; automated needs the provider's payouts switch too."
    >
      <ul className="mb-3 space-y-1 text-xs">
        {market.payoutMethods.map((pm) => (
          <li
            key={`${pm.method}:${pm.currency}`}
            className="flex items-center gap-2"
          >
            <Badge tone={pm.enabled ? "success" : "neutral"}>
              {pm.enabled ? "on" : "off"}
            </Badge>
            <span className="font-medium">
              {pm.method === "bank" ? "Bank" : "Mobile money"}
            </span>
            <span className="text-muted-foreground">
              {pm.currency} · {pm.automated ? "automated" : "manual"} ·{" "}
              {pm.fields.map((f) => f.key).join(", ") || "no extra fields"}
            </span>
          </li>
        ))}
      </ul>
      {canManage ? (
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            let fields: {
              key: string;
              label: string;
              required: boolean;
              pattern?: string;
              example?: string;
            }[];
            try {
              fields = JSON.parse(fieldsJson);
              if (!Array.isArray(fields)) throw new Error("not an array");
            } catch {
              setMsg({ ok: false, text: "Fields must be a JSON array." });
              return;
            }
            start(async () => {
              const res = await upsertMarketPayoutMethod({
                countryCode: market.countryCode,
                method,
                provider: provider === "" ? null : provider,
                enabled,
                currency,
                automated,
                fields,
              });
              setMsg({
                ok: res.status === 200,
                text: res.message ?? (res.status === 200 ? "Saved." : "Failed"),
              });
              if (res.status === 200) router.refresh();
            });
          }}
        >
          <label className={label}>
            Rail
            <select
              className={input}
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as "mobile_money" | "bank")
              }
            >
              <option value="bank">Bank</option>
              <option value="mobile_money">Mobile money</option>
            </select>
          </label>
          <label className={label}>
            Provider (for automated transfers)
            <select
              className={input}
              value={provider}
              onChange={(e) =>
                setProvider(e.target.value as PaymentProviderCode | "")
              }
            >
              <option value="">None (manual)</option>
              {PAYMENT_PROVIDER_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Currency
            <input
              className={input}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </label>
          <div className="flex items-end gap-4 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />{" "}
              Enabled
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={automated}
                onChange={(e) => setAutomated(e.target.checked)}
              />{" "}
              Automated
            </label>
          </div>
          <label className={cn(label, "col-span-2")}>
            Account fields (JSON)
            <textarea
              className={cn(input, "font-mono")}
              rows={6}
              value={fieldsJson}
              onChange={(e) => setFieldsJson(e.target.value)}
            />
          </label>
          <div className="col-span-2 flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save payout rail"}
            </Button>
            <Msg msg={msg} />
          </div>
        </form>
      ) : null}
    </Section>
  );
}

// ── Regions ────────────────────────────────────────────────

function RegionsSection({
  market,
  canManage,
}: { market: MarketConfig; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("25");
  const [tz, setTz] = useState("");

  return (
    <Section
      title="Cities and regions"
      hint="Where discovery centres when a person's location is unknown, and the areas offered in the location picker. Give a region its own time zone only in multi-zone countries."
    >
      <ul className="mb-3 space-y-1 text-xs">
        {market.regions.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <Badge tone={r.status === "active" ? "success" : "neutral"}>
              {r.status}
            </Badge>
            <span className="font-medium">{r.name}</span>
            <span className="text-muted-foreground">
              {r.slug} · {r.lat.toFixed(3)}, {r.lng.toFixed(3)} · {r.radiusKm}{" "}
              km
            </span>
          </li>
        ))}
        {market.regions.length === 0 ? (
          <li className="text-muted-foreground">No regions yet.</li>
        ) : null}
      </ul>
      {canManage ? (
        <form
          className="grid grid-cols-3 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            start(async () => {
              const res = await upsertMarketRegion({
                countryCode: market.countryCode,
                slug:
                  slug.trim() ||
                  name
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                name: name.trim(),
                kind: "city",
                lat: Number(lat),
                lng: Number(lng),
                radiusKm: Number(radius) || 25,
                timezone: tz.trim() || null,
                status: "active",
              });
              setMsg({
                ok: res.status === 200,
                text: res.message ?? (res.status === 200 ? "Saved." : "Failed"),
              });
              if (res.status === 200) {
                setName("");
                setSlug("");
                setLat("");
                setLng("");
                router.refresh();
              }
            });
          }}
        >
          <label className={label}>
            Name
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className={label}>
            Slug (optional)
            <input
              className={input}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </label>
          <label className={label}>
            Radius (km)
            <input
              className={input}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
            />
          </label>
          <label className={label}>
            Latitude
            <input
              className={input}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required
            />
          </label>
          <label className={label}>
            Longitude
            <input
              className={input}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              required
            />
          </label>
          <label className={label}>
            Time zone (optional)
            <input
              className={input}
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="America/Chicago"
            />
          </label>
          <div className="col-span-3 flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Add region"}
            </Button>
            <Msg msg={msg} />
          </div>
        </form>
      ) : null}
    </Section>
  );
}

// ── Readiness and activation ───────────────────────────────

function ReadinessSection({
  market,
  canActivate,
  stepUpFresh,
  lastReadiness,
}: {
  market: MarketConfig;
  canActivate: boolean;
  stepUpFresh: boolean;
  lastReadiness: {
    ranAt: string;
    canActivate: boolean;
    report: ReadinessReport;
  } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [report, setReport] = useState<ReadinessReport | null>(
    lastReadiness?.report ?? null,
  );
  const [reason, setReason] = useState("");
  const transitions = availableTransitions(market.status);

  return (
    <Section
      title="Readiness and activation"
      hint="Every check runs live (credentials, provider reachability, rates, monitoring). Activation is refused while a critical check fails."
    >
      <div className="mb-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const res = await runMarketReadiness(market.countryCode);
              if (res.status === 200 && "data" in res && res.data) {
                setReport(res.data);
                setMsg({
                  ok: res.data.canActivate,
                  text: res.data.canActivate
                    ? "All critical checks pass."
                    : "Some critical checks fail.",
                });
              } else {
                setMsg({
                  ok: false,
                  text: res.message ?? "Couldn't run the checks.",
                });
              }
            });
          }}
        >
          {pending ? "Checking…" : "Run readiness checks"}
        </Button>
        {lastReadiness ? (
          <span className="text-xs text-muted-foreground">
            Last run {lastReadiness.ranAt.slice(0, 16).replace("T", " ")}
          </span>
        ) : null}
      </div>
      {report ? (
        <ul className="mb-3 divide-y divide-border rounded border border-border text-xs">
          {report.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 px-2 py-1.5">
              <Badge
                tone={
                  c.status === "pass"
                    ? "success"
                    : c.status === "warn"
                      ? "warning"
                      : "danger"
                }
              >
                {c.status}
              </Badge>
              <div>
                <div className="font-medium">
                  {c.label}
                  {!c.critical ? (
                    <span className="ml-1 font-normal text-muted-foreground">
                      (advisory)
                    </span>
                  ) : null}
                </div>
                <div className="text-muted-foreground">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          No readiness report yet.
        </p>
      )}

      <div className="space-y-2">
        <label className={label}>
          Reason (recorded in the audit log)
          <input
            className={input}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this change"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {transitions.map((t) => {
            const rule = MARKET_TRANSITIONS[t];
            const blocked = rule.stepUp && (!canActivate || !stepUpFresh);
            return (
              <Button
                key={t}
                size="sm"
                variant={
                  t === "activate" || t === "resume"
                    ? "primary"
                    : t === "pause"
                      ? "danger"
                      : "outline"
                }
                disabled={pending || blocked}
                title={
                  blocked
                    ? "Needs markets.activate and a fresh identity confirmation"
                    : undefined
                }
                onClick={() => {
                  setMsg(null);
                  start(async () => {
                    const res = await transitionMarket({
                      countryCode: market.countryCode,
                      transition: t as MarketTransition,
                      reason: reason || null,
                    });
                    setMsg({
                      ok: res.status === 200,
                      text:
                        res.status === 200
                          ? `Market is now ${"data" in res && res.data ? res.data.status : "updated"}.`
                          : (res.message ?? "Failed"),
                    });
                    if (res.status === 200) router.refresh();
                  });
                }}
              >
                {rule.label}
              </Button>
            );
          })}
        </div>
        <Msg msg={msg} />
      </div>
    </Section>
  );
}
