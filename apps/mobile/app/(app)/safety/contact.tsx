import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { useHomeDialCode } from "@/features/markets/MarketProvider";
import {
  safetyOverviewKey,
  useSafetyOverview,
} from "@/features/safety/useSafety";
import { api } from "@/lib/api";
import { formatPhoneInternational } from "@abonten/core/phone/phone";
import {
  SAFETY_CONTACT_NAME_MAX,
  SAFETY_RELATIONSHIPS,
} from "@abonten/core/safety/rules";
import { LOCALE_NAMES, LOCALE_ORDER } from "@abonten/i18n/locales";
import type { SafetyRelationship } from "@abonten/types/safetyType";
import {
  AppText,
  Button,
  Chip,
  Field,
  Input,
  KeyboardAwareScrollView,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";

// Add or change a trusted contact. A new contact is texted once with a link
// to accept or decline; the number cannot be changed afterwards (remove the
// contact and add the new number, so the right person gets the invite).

export default function SafetyContactScreen() {
  const t = useTranslations("safety");
  const { locale: appLocale } = useLocale();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const overview = useSafetyOverview();
  const existing =
    overview.data?.data?.contacts.find((c) => c.id === id) ?? null;
  const homeDialCode = useHomeDialCode();

  const [name, setName] = useState("");
  const [dialCode, setDialCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] =
    useState<SafetyRelationship>("family");
  const [locale, setLocale] = useState<string>(appLocale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setEmail(existing.email ?? "");
    setRelationship(existing.relationship);
    setLocale(existing.locale);
  }, [existing]);

  const done = async (message: string) => {
    await qc.invalidateQueries({
      queryKey: safetyOverviewKey(session?.user.id),
    });
    toast.success(message);
    router.back();
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t("enterContactName"));
      return;
    }
    setBusy(true);
    try {
      const res = existing
        ? await api.safety.updateContact(existing.id, {
            name: name.trim(),
            email: email.trim() || null,
            relationship,
            locale,
          })
        : await api.safety.addContact({
            name: name.trim(),
            dialCode: (dialCode ?? homeDialCode).trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            relationship,
            locale,
          });
      if ((res.status === 200 || res.status === 201) && res.data) {
        await done(
          existing
            ? t("contactSaved")
            : res.data.canText || res.data.email
              ? t("contactAddedInvited", { name: res.data.name })
              : t("contactAddedNoText", { name: res.data.name }),
        );
        return;
      }
      setError(res.message ?? t("couldNotSave"));
    } catch {
      setError(t("networkError"));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert(
      t("removeContactTitle", { name: existing.name }),
      t("removeContactBody"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("remove"),
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const res = await api.safety.removeContact(existing.id);
              if (res.status === 200) await done(t("contactRemoved"));
              else setError(res.message ?? t("couldNotSave"));
            } catch {
              setError(t("networkError"));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const simple = async (
    call: () => Promise<{ status: number; message?: string }>,
    message: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await call();
      if (res.status === 200) await done(message);
      else setError(res.message ?? t("couldNotSave"));
    } catch {
      setError(t("networkError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="form"
        title={existing ? t("editContactTitle") : t("addContactTitle")}
        backFallback="/(app)/safety"
      />
      <KeyboardAwareScrollView contentContainerClassName="gap-5 p-4 pb-16">
        {!existing ? (
          <AppText variant="small">{t("addContactIntro")}</AppText>
        ) : null}

        <Field label={t("contactName")}>
          <Input
            value={name}
            onChangeText={setName}
            maxLength={SAFETY_CONTACT_NAME_MAX}
            autoCapitalize="words"
            textContentType="name"
            placeholder={t("contactNamePlaceholder")}
          />
        </Field>

        {existing ? (
          <Field label={t("phoneNumber")} hint={t("phoneLocked")}>
            <AppText variant="bodyStrong">
              {formatPhoneInternational(existing.phoneE164)}
            </AppText>
          </Field>
        ) : (
          <View className="flex-row gap-2">
            <View className="w-20">
              <Field label={t("countryCode")}>
                <Input
                  value={dialCode ?? homeDialCode}
                  onChangeText={setDialCode}
                  keyboardType="phone-pad"
                  accessibilityLabel={t("countryCode")}
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label={t("phoneNumber")}>
                <Input
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  placeholder="24 123 4567"
                />
              </Field>
            </View>
          </View>
        )}

        <View className="gap-2">
          <AppText variant="label">{t("relationship")}</AppText>
          <View className="flex-row flex-wrap gap-2">
            {SAFETY_RELATIONSHIPS.map((r) => (
              <Chip
                key={r}
                label={t("relationshipName", { relationship: r })}
                selected={relationship === r}
                onPress={() => setRelationship(r)}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <AppText variant="label">{t("theirLanguage")}</AppText>
          <View className="flex-row flex-wrap gap-2">
            {LOCALE_ORDER.map((l) => (
              <Chip
                key={l}
                label={LOCALE_NAMES[l]}
                selected={locale === l}
                onPress={() => setLocale(l)}
              />
            ))}
          </View>
          <AppText variant="caption">{t("theirLanguageHint")}</AppText>
        </View>

        <Field label={t("emailOptional")} hint={t("emailHint")}>
          <Input
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
          />
        </Field>

        {error ? (
          <AppText variant="small" tone="error">
            {error}
          </AppText>
        ) : null}

        <Button
          title={existing ? t("saveContact") : t("addAndInvite")}
          loading={busy}
          loadingTitle={t("saving")}
          fullWidth
          onPress={() => void save()}
        />

        {existing ? (
          <View className="gap-2 border-t border-border pt-4">
            {existing.canResendInvite ? (
              <Button
                title={t("resendInvite")}
                variant="outline"
                disabled={busy}
                onPress={() =>
                  void simple(
                    () => api.safety.resendInvite(existing.id),
                    t("inviteSent"),
                  )
                }
              />
            ) : null}
            {existing.position !==
            Math.min(
              ...(overview.data?.data?.contacts ?? []).map((c) => c.position),
            ) ? (
              <Button
                title={t("makeFirst")}
                variant="outline"
                disabled={busy}
                onPress={() =>
                  void simple(
                    () =>
                      api.safety.updateContact(existing.id, {
                        makeFirst: true,
                      }),
                    t("contactSaved"),
                  )
                }
              />
            ) : null}
            <Button
              title={t("removeContact")}
              variant="ghost"
              disabled={busy}
              onPress={remove}
            />
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
