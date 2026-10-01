import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { TimeField } from "@/components/datetime/TimeField";
import { MapPickerSheet } from "@/components/explore/MapPickerSheet";
import { PlacePhotoManager } from "@/components/places/PlacePhotoManager";
import { FormSkeleton } from "@/components/skeletons";
import {
  useAddPlaceService,
  useRemovePlaceService,
  useUpdatePlaceService,
} from "@/features/organizer/useManagePlace";
import {
  TIME_RE,
  dayLabel,
  usePlaceEdit,
} from "@/features/organizer/usePlaceEdit";
import type {
  PlaceServiceRow,
  PlaceTemporaryStatus,
} from "@abonten/api-client";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import {
  AppText,
  Button,
  Chip,
  Field,
  Icon,
  Input,
  KeyboardAwareScrollView,
  ScreenError,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  View,
} from "react-native";

const STATUS_OPTIONS: { value: PlaceTemporaryStatus; label: string }[] = [
  { value: null, label: "hoursStatus.normalHours" },
  { value: "temporarily_closed", label: "hoursStatus.temporarilyClosed" },
  { value: "permanently_closed", label: "hoursStatus.permanentlyClosed" },
];

type ServiceForm = {
  name: string;
  description: string;
  price: string;
  priceUnit: string;
  showPrice: boolean;
};

const EMPTY_SERVICE: ServiceForm = {
  name: "",
  description: "",
  price: "",
  priceUnit: "",
  showPrice: true,
};

function toForm(s: PlaceServiceRow): ServiceForm {
  return {
    name: s.name,
    description: s.description ?? "",
    price: s.price != null ? String(s.price) : "",
    priceUnit: s.price_unit ?? "",
    showPrice: s.show_price,
  };
}

function ServiceFields({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
}: {
  value: ServiceForm;
  onChange: (patch: Partial<ServiceForm>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  const t = useTranslations("manage");

  return (
    <View className="gap-2">
      <Input
        value={value.name}
        onChangeText={(v) => onChange({ name: v })}
        placeholder={t("serviceName")}
      />
      <Input
        value={value.description}
        onChangeText={(v) => onChange({ description: v })}
        placeholder={t("descriptionOptional")}
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Input
            value={value.price}
            onChangeText={(v) => onChange({ price: v })}
            placeholder={t("priceOptional")}
            keyboardType="decimal-pad"
          />
        </View>
        <View className="flex-1">
          <Input
            value={value.priceUnit}
            onChangeText={(v) => onChange({ priceUnit: v })}
            placeholder={t("unitEGPerHour")}
          />
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        <AppText className="text-sm text-foreground">
          {t("showPricePublicly")}
        </AppText>
        <Switch
          value={value.showPrice}
          onValueChange={(v) => onChange({ showPrice: v })}
        />
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            title={submitting ? t("saving") : submitLabel}
            loading={submitting}
            disabled={submitting || !value.name.trim()}
            onPress={onSubmit}
          />
        </View>
        <View className="flex-1">
          <Button
            title={t("cancel")}
            variant="outline"
            onPress={onCancel}
            disabled={submitting}
          />
        </View>
      </View>
    </View>
  );
}

function ServicesSection({
  placeId,
  services,
}: {
  placeId: string;
  services: PlaceServiceRow[];
}) {
  const t = useTranslations("manage");

  const toast = useToast();
  const add = useAddPlaceService(placeId);
  const update = useUpdatePlaceService(placeId);
  const remove = useRemovePlaceService(placeId);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(EMPTY_SERVICE);

  const patch = (p: Partial<ServiceForm>) =>
    setForm((prev) => ({ ...prev, ...p }));

  const priceValue = (): number | null => {
    const t = form.price.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const beginAdd = () => {
    setForm(EMPTY_SERVICE);
    setEditingId(null);
    setAdding(true);
  };

  const beginEdit = (s: PlaceServiceRow) => {
    setForm(toForm(s));
    setAdding(false);
    setEditingId(s.id);
  };

  const submitAdd = () => {
    if (form.price.trim() !== "" && priceValue() === null) {
      toast.error(t("checkThePrice"), {
        description: t("enterANumberOrLeaveIt"),
      });
      return;
    }
    add.mutate(
      {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: priceValue(),
        priceUnit: form.priceUnit.trim() || null,
        showPrice: form.showPrice,
      },
      {
        onSuccess: (res) => {
          if (res.status === 200) setAdding(false);
          else toast.error(t("couldnTAdd"), { description: res.message });
        },
        onError: () =>
          toast.error(t("couldnTAdd"), { description: t("pleaseTryAgain") }),
      },
    );
  };

  const submitEdit = (serviceId: string) => {
    if (form.price.trim() !== "" && priceValue() === null) {
      toast.error(t("checkThePrice"), {
        description: t("enterANumberOrLeaveIt"),
      });
      return;
    }
    update.mutate(
      {
        serviceId,
        body: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: priceValue(),
          priceUnit: form.priceUnit.trim() || null,
          showPrice: form.showPrice,
        },
      },
      {
        onSuccess: (res) => {
          if (res.status === 200) setEditingId(null);
          else toast.error(t("couldnTSave"), { description: res.message });
        },
        onError: () =>
          toast.error(t("couldnTSave"), { description: t("pleaseTryAgain") }),
      },
    );
  };

  const confirmRemove = (s: PlaceServiceRow) => {
    Alert.alert(
      t("removeThisService"),
      t("thisCanTBeUndone2", { name: s.name }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("remove"),
          style: "destructive",
          onPress: () =>
            remove.mutate(s.id, {
              onSuccess: (res) => {
                if (res.status !== 200)
                  toast.error(t("couldnTRemove"), { description: res.message });
              },
              onError: () =>
                toast.error(t("couldnTRemove"), {
                  description: t("pleaseTryAgain"),
                }),
            }),
        },
      ],
    );
  };

  return (
    <View className="gap-3">
      <AppText variant="label">{t("services")}</AppText>

      {services.length === 0 && !adding ? (
        <AppText variant="muted">{t("noServicesListedYet")}</AppText>
      ) : null}

      {services.map((s) =>
        editingId === s.id ? (
          <View
            key={s.id}
            className="gap-2 rounded-xl border border-border bg-card p-3"
          >
            <ServiceFields
              value={form}
              onChange={patch}
              onSubmit={() => submitEdit(s.id)}
              onCancel={() => setEditingId(null)}
              submitting={update.isPending}
              submitLabel={t("save")}
            />
          </View>
        ) : (
          <View
            key={s.id}
            className="flex-row items-start justify-between gap-3 rounded-xl border border-border bg-card p-3"
          >
            <View className="flex-1">
              <AppText className="font-semibold text-foreground">
                {s.name}
              </AppText>
              {s.description ? (
                <AppText className="mt-0.5 text-[13px] text-muted-foreground">
                  {s.description}
                </AppText>
              ) : null}
              {s.show_price && s.price != null ? (
                <AppText className="mt-0.5 text-[13px] font-medium text-foreground">
                  {s.price}
                  {s.price_unit ? ` / ${s.price_unit}` : ""}
                </AppText>
              ) : null}
            </View>
            <View className="flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => beginEdit(s)}
                className="p-1 active:opacity-60"
              >
                <Icon name="pencil-outline" size={18} tone="muted" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => confirmRemove(s)}
                className="p-1 active:opacity-60"
              >
                <Icon name="trash-outline" size={18} tone="destructive" />
              </Pressable>
            </View>
          </View>
        ),
      )}

      {adding ? (
        <View className="gap-2 rounded-xl border border-border bg-card p-3">
          <ServiceFields
            value={form}
            onChange={patch}
            onSubmit={submitAdd}
            onCancel={() => setAdding(false)}
            submitting={add.isPending}
            submitLabel={t("addService")}
          />
        </View>
      ) : (
        <Button
          title={t("addAService")}
          variant="outline"
          size="sm"
          onPress={beginAdd}
        />
      )}
    </View>
  );
}

export default function EditPlaceScreen() {
  const t = useTranslations("manage");
  const { locale } = useLocale();
  const tc = useTranslations("core");

  const toast = useToast();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const w = usePlaceEdit(placeId ?? "");
  const [mapOpen, setMapOpen] = useState(false);

  if (!w.isReady) {
    // A definite answer from the server (not yours, no such place) keeps
    // its message; loading, offline and failed are told apart from it, so
    // the form never sits on a skeleton the phone cannot fill.
    if (typeof w.loadError === "string") {
      return <ScreenError message={w.loadError} onRetry={() => w.reload()} />;
    }
    if (w.loadView.kind === "offline" || w.loadView.kind === "error") {
      return (
        <View className="flex-1 bg-background">
          <QueryUnavailable
            view={w.loadView}
            subject={t("thisPlace")}
            onRetry={() => w.reload()}
          />
        </View>
      );
    }
    return <FormSkeleton fields={6} />;
  }

  const coverPreview = w.newCoverUri
    ? w.newCoverUri
    : w.existingCover
      ? buildCloudinaryUrl(w.existingCover.publicId, w.existingCover.version, {
          width: 400,
          height: 225,
        })
      : null;

  async function onSaveDetails() {
    const res = await w.saveDetails();
    if (!res) return;
    if (res.status === 200) {
      toast.success(t("placeUpdated"));
    } else {
      toast.error(res.message ?? t("weCouldnTSaveYourChanges"), {
        description: t("yourEditsAreStillOnScreen"),
        action: { label: t("retry"), onPress: onSaveDetails },
      });
    }
    if (res.status === 200) router.back();
  }

  async function onSaveHours() {
    const res = await w.saveHours();
    if (!res) return;
    if (res.status === 200) {
      toast.success(t("openingHoursUpdated"));
    } else {
      toast.error(res.message ?? t("weCouldnTSaveYourOpening"), {
        description: t("yourEditsAreStillOnScreen"),
        action: { label: t("retry"), onPress: onSaveHours },
      });
    }
  }

  function onPickStatus(next: PlaceTemporaryStatus) {
    if (next === w.status) return;
    const commit = async () => {
      const res = await w.applyStatus(next);
      if (res && res.status !== 200) {
        toast.error(t("couldnTUpdate"), {
          description: res.message ?? t("pleaseTryAgain"),
        });
      }
    };
    if (next === null) {
      commit();
      return;
    }
    Alert.alert(
      next === "permanently_closed"
        ? t("markAsPermanentlyClosed")
        : t("markAsTemporarilyClosed"),
      next === "permanently_closed"
        ? t("itWillStopAppearingAsOpen")
        : t("itWillShowAsClosedTo"),
      [
        { text: t("cancel"), style: "cancel" },
        { text: t("markClosed"), style: "destructive", onPress: commit },
      ],
    );
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      {/* Details */}
      <Field label={t("name")} error={w.textErrors.name}>
        <Input value={w.name} onChangeText={w.setName} />
      </Field>

      <Field label={t("description")} error={w.textErrors.description}>
        <Input
          value={w.description}
          onChangeText={w.setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: "top" }}
        />
      </Field>

      <Field label={t("category")}>
        <View className="flex-row flex-wrap gap-2">
          {w.categories.map((c) => (
            <Chip
              key={c.id}
              label={placeCategoryLabel(tc, c)}
              selected={c.id === w.categoryId}
              onPress={() => w.setCategoryId(c.id)}
            />
          ))}
        </View>
      </Field>

      <Field
        label={t("website")}
        error={w.textErrors.website_url}
        hint={t("optional")}
      >
        <Input
          value={w.website}
          onChangeText={w.setWebsite}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://example.com"
        />
      </Field>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field
            label={t("phone")}
            error={w.textErrors.phone}
            hint={t("optional")}
          >
            <Input
              value={w.phone}
              onChangeText={w.setPhone}
              keyboardType="phone-pad"
            />
          </Field>
        </View>
        <View className="flex-1">
          <Field
            label="WhatsApp"
            error={w.textErrors.whatsapp}
            hint={t("optional")}
          >
            <Input
              value={w.whatsapp}
              onChangeText={w.setWhatsapp}
              keyboardType="phone-pad"
            />
          </Field>
        </View>
      </View>

      {/* Cover */}
      <Field label={t("coverPhoto")}>
        <View className="gap-2">
          {coverPreview ? (
            <Image
              source={{ uri: coverPreview }}
              style={{ width: 200, height: 112, borderRadius: 10 }}
              contentFit="cover"
              transition={150}
            />
          ) : null}
          <Button
            title={
              w.newCoverUri ? t("chooseADifferentPhoto") : t("changeCover")
            }
            variant="outline"
            size="sm"
            onPress={w.pickCover}
          />
        </View>
      </Field>

      {/* Gallery photos */}
      <Field label={t("photos")} hint={t("theseShowInThePlaceS")}>
        <PlacePhotoManager
          placeId={placeId ?? ""}
          photos={w.photos}
          currentCoverPublicId={w.coverPublicId}
        />
      </Field>

      {/* Location */}
      <Field label={t("location")}>
        <View className="gap-2">
          <Input
            value={w.autocomplete.query}
            onChangeText={w.autocomplete.setQuery}
            placeholder={t("startTypingAnAddress")}
            autoCorrect={false}
          />
          {w.resolvingLocation ? (
            <View className="flex-row items-center gap-2 py-1">
              <ActivityIndicator size="small" />
              <AppText variant="meta">{t("resolvingLocation")}</AppText>
            </View>
          ) : null}
          {w.autocomplete.predictions.length > 0 ? (
            <View className="overflow-hidden rounded-lg border border-border">
              {w.autocomplete.predictions.map((p) => (
                <Pressable
                  accessibilityRole="button"
                  key={p.placeId}
                  onPress={() => w.pickSuggestion(p.placeId)}
                  className="border-border border-b px-3 py-2 active:opacity-70"
                >
                  <AppText variant="small">{p.primary}</AppText>
                  {p.secondary ? (
                    <AppText variant="caption">{p.secondary}</AppText>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          <View className="flex-row gap-4">
            <Pressable
              accessibilityRole="button"
              onPress={() => setMapOpen(true)}
              className="flex-row items-center gap-2 py-1 active:opacity-70"
            >
              <Icon name="map-outline" size={16} tone="primary" />
              <AppText variant="small" tone="brand">
                {t("chooseOnMap")}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={w.useCurrentLocation}
              className="flex-row items-center gap-2 py-1 active:opacity-70"
            >
              <Icon name="locate-outline" size={16} tone="primary" />
              <AppText variant="small" tone="brand">
                {t("currentLocation")}
              </AppText>
            </Pressable>
          </View>
          {w.address && w.coords ? (
            <AppText variant="meta">
              {t("selected", { address: w.address })}
            </AppText>
          ) : (
            <AppText variant="small" tone="error">
              {t("rePickTheLocationSoThe")}
            </AppText>
          )}
        </View>
      </Field>

      <Button
        title={w.isSavingDetails ? t("saving") : t("saveDetails")}
        loading={w.isSavingDetails}
        disabled={w.isSavingDetails}
        onPress={onSaveDetails}
      />

      <View className="h-px bg-border" />

      {/* Status */}
      <View className="gap-3">
        <AppText variant="label">{t("status2")}</AppText>
        <View className="flex-row flex-wrap gap-2">
          {STATUS_OPTIONS.map((o) => (
            <Chip
              key={o.label}
              label={t(o.label)}
              selected={o.value === w.status}
              onPress={() => onPickStatus(o.value)}
            />
          ))}
        </View>
        {w.status ? (
          <Field
            label={t("noteForVisitors")}
            hint={t("optionalReasonReopeningDate")}
          >
            <Input
              value={w.statusNote}
              onChangeText={w.setStatusNote}
              onBlur={() => w.applyStatus(w.status)}
              multiline
              numberOfLines={2}
              style={{ minHeight: 60, textAlignVertical: "top" }}
            />
          </Field>
        ) : null}
        {w.isSavingStatus ? (
          <AppText variant="meta">{t("savingStatus")}</AppText>
        ) : null}
      </View>

      <View className="h-px bg-border" />

      {/* Weekly hours */}
      <View className="gap-3">
        <AppText variant="label">{t("weeklyHours")}</AppText>
        {w.hours.map((h) => (
          <View
            key={h.dayOfWeek}
            className="gap-2 rounded-xl border border-border bg-card p-3"
          >
            <View className="flex-row items-center justify-between">
              <AppText variant="bodyStrong">
                {dayLabel(h.dayOfWeek, locale)}
              </AppText>
              <Switch
                value={!h.isClosed}
                onValueChange={(open) =>
                  w.setHours(h.dayOfWeek, { isClosed: !open })
                }
              />
            </View>
            {!h.isClosed ? (
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <TimeField
                    label={t("opens")}
                    value={h.openTime ?? null}
                    onChange={(v) => w.setHours(h.dayOfWeek, { openTime: v })}
                    invalid={!TIME_RE.test(h.openTime ?? "")}
                  />
                </View>
                <AppText variant="muted">{t("to")}</AppText>
                <View className="flex-1">
                  <TimeField
                    label={t("closes")}
                    value={h.closeTime ?? null}
                    onChange={(v) => w.setHours(h.dayOfWeek, { closeTime: v })}
                    invalid={!TIME_RE.test(h.closeTime ?? "")}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ))}
        <Button
          title={w.isSavingHours ? t("saving") : t("saveHours")}
          variant="secondary"
          loading={w.isSavingHours}
          disabled={w.isSavingHours || !w.hoursComplete}
          onPress={onSaveHours}
        />
      </View>

      <View className="h-px bg-border" />

      <ServicesSection placeId={placeId ?? ""} services={w.services} />

      <MapPickerSheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initial={w.coords}
        onPick={(loc) => w.setMapLocation(loc)}
      />
    </KeyboardAwareScrollView>
  );
}
