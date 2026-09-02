import { MapPickerSheet } from "@/components/explore/MapPickerSheet";
import {
  useAddPlaceService,
  useRemovePlaceService,
  useUpdatePlaceService,
} from "@/features/organizer/useManagePlace";
import {
  DAY_LABELS,
  TIME_RE,
  usePlaceEdit,
} from "@/features/organizer/usePlaceEdit";
import type {
  PlaceServiceRow,
  PlaceTemporaryStatus,
} from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { AppText, Button, Field, Icon, Input } from "@abonten/ui-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1.5"
          : "rounded-full border border-border px-3 py-1.5"
      }
    >
      <AppText
        className={
          active
            ? "text-[12px] font-semibold text-primary-foreground"
            : "text-[12px] font-medium text-muted-foreground"
        }
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const STATUS_OPTIONS: { value: PlaceTemporaryStatus; label: string }[] = [
  { value: null, label: "Normal hours" },
  { value: "temporarily_closed", label: "Temporarily closed" },
  { value: "permanently_closed", label: "Permanently closed" },
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
  return (
    <View className="gap-2">
      <Input
        value={value.name}
        onChangeText={(v) => onChange({ name: v })}
        placeholder="Service name"
      />
      <Input
        value={value.description}
        onChangeText={(v) => onChange({ description: v })}
        placeholder="Description (optional)"
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Input
            value={value.price}
            onChangeText={(v) => onChange({ price: v })}
            placeholder="Price (optional)"
            keyboardType="decimal-pad"
          />
        </View>
        <View className="flex-1">
          <Input
            value={value.priceUnit}
            onChangeText={(v) => onChange({ priceUnit: v })}
            placeholder="Unit (e.g. per hour)"
          />
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        <AppText className="text-sm text-foreground">
          Show price publicly
        </AppText>
        <Switch
          value={value.showPrice}
          onValueChange={(v) => onChange({ showPrice: v })}
        />
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            title={submitting ? "Saving…" : submitLabel}
            loading={submitting}
            disabled={submitting || !value.name.trim()}
            onPress={onSubmit}
          />
        </View>
        <View className="flex-1">
          <Button
            title="Cancel"
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
      Alert.alert("Check the price", "Enter a number or leave it blank.");
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
          else Alert.alert("Couldn't add", res.message);
        },
        onError: () => Alert.alert("Couldn't add", "Please try again."),
      },
    );
  };

  const submitEdit = (serviceId: string) => {
    if (form.price.trim() !== "" && priceValue() === null) {
      Alert.alert("Check the price", "Enter a number or leave it blank.");
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
          else Alert.alert("Couldn't save", res.message);
        },
        onError: () => Alert.alert("Couldn't save", "Please try again."),
      },
    );
  };

  const confirmRemove = (s: PlaceServiceRow) => {
    Alert.alert("Remove this service?", `"${s.name}" — this can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          remove.mutate(s.id, {
            onSuccess: (res) => {
              if (res.status !== 200)
                Alert.alert("Couldn't remove", res.message);
            },
            onError: () => Alert.alert("Couldn't remove", "Please try again."),
          }),
      },
    ]);
  };

  return (
    <View className="gap-3">
      <AppText variant="label">Services</AppText>

      {services.length === 0 && !adding ? (
        <AppText className="text-[13px] text-muted-foreground">
          No services listed yet.
        </AppText>
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
              submitLabel="Save"
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
                onPress={() => beginEdit(s)}
                className="p-1 active:opacity-60"
              >
                <Icon name="pencil-outline" size={18} tone="muted" />
              </Pressable>
              <Pressable
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
            submitLabel="Add service"
          />
        </View>
      ) : (
        <Button
          title="Add a service"
          variant="outline"
          size="sm"
          onPress={beginAdd}
        />
      )}
    </View>
  );
}

export default function EditPlaceScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const w = usePlaceEdit(placeId ?? "");
  const [mapOpen, setMapOpen] = useState(false);

  if (w.isLoading || !w.isReady) {
    if (w.loadError) {
      return (
        <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
          <AppText className="text-center text-muted-foreground">
            {typeof w.loadError === "string"
              ? w.loadError
              : "Couldn't load this place."}
          </AppText>
        </View>
      );
    }
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
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
    Alert.alert(
      res.status === 200 ? "Saved" : "Couldn't save",
      res.status === 200
        ? "Your place has been updated."
        : (res.message ?? "Please try again."),
    );
    if (res.status === 200) router.back();
  }

  async function onSaveHours() {
    const res = await w.saveHours();
    if (!res) return;
    Alert.alert(
      res.status === 200 ? "Saved" : "Couldn't save",
      res.status === 200
        ? "Opening hours updated."
        : (res.message ?? "Please try again."),
    );
  }

  function onPickStatus(next: PlaceTemporaryStatus) {
    if (next === w.status) return;
    const commit = async () => {
      const res = await w.applyStatus(next);
      if (res && res.status !== 200) {
        Alert.alert("Couldn't update", res.message ?? "Please try again.");
      }
    };
    if (next === null) {
      commit();
      return;
    }
    Alert.alert(
      next === "permanently_closed"
        ? "Mark as permanently closed?"
        : "Mark as temporarily closed?",
      next === "permanently_closed"
        ? "It will stop appearing as open in searches."
        : "It will show as closed to visitors until you switch back to Normal hours.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark closed", style: "destructive", onPress: commit },
      ],
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      {/* Details */}
      <Field label="Name" error={w.textErrors.name}>
        <Input value={w.name} onChangeText={w.setName} />
      </Field>

      <Field label="Description" error={w.textErrors.description}>
        <Input
          value={w.description}
          onChangeText={w.setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: "top" }}
        />
      </Field>

      <Field label="Category">
        <View className="flex-row flex-wrap gap-2">
          {w.categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={c.id === w.categoryId}
              onPress={() => w.setCategoryId(c.id)}
            />
          ))}
        </View>
      </Field>

      <Field label="Website" error={w.textErrors.website_url} hint="Optional">
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
          <Field label="Phone" error={w.textErrors.phone} hint="Optional">
            <Input
              value={w.phone}
              onChangeText={w.setPhone}
              keyboardType="phone-pad"
            />
          </Field>
        </View>
        <View className="flex-1">
          <Field label="WhatsApp" error={w.textErrors.whatsapp} hint="Optional">
            <Input
              value={w.whatsapp}
              onChangeText={w.setWhatsapp}
              keyboardType="phone-pad"
            />
          </Field>
        </View>
      </View>

      {/* Cover */}
      <Field label="Cover photo">
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
            title={w.newCoverUri ? "Choose a different photo" : "Change cover"}
            variant="outline"
            size="sm"
            onPress={w.pickCover}
          />
        </View>
      </Field>

      {/* Location */}
      <Field label="Location">
        <View className="gap-2">
          <Input
            value={w.autocomplete.query}
            onChangeText={w.autocomplete.setQuery}
            placeholder="Start typing an address…"
            autoCorrect={false}
          />
          {w.resolvingLocation ? (
            <View className="flex-row items-center gap-2 py-1">
              <ActivityIndicator size="small" />
              <AppText className="text-[12px] text-muted-foreground">
                Resolving location…
              </AppText>
            </View>
          ) : null}
          {w.autocomplete.predictions.length > 0 ? (
            <View className="overflow-hidden rounded-lg border border-border">
              {w.autocomplete.predictions.map((p) => (
                <Pressable
                  key={p.placeId}
                  onPress={() => w.pickSuggestion(p.placeId)}
                  className="border-border border-b px-3 py-2 active:opacity-70"
                >
                  <AppText className="text-[13px] text-foreground">
                    {p.primary}
                  </AppText>
                  {p.secondary ? (
                    <AppText className="text-[11px] text-muted-foreground">
                      {p.secondary}
                    </AppText>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          <View className="flex-row gap-4">
            <Pressable
              onPress={() => setMapOpen(true)}
              className="flex-row items-center gap-2 py-1 active:opacity-70"
            >
              <Icon name="map-outline" size={16} tone="primary" />
              <AppText className="text-[13px] text-primary">
                Choose on map
              </AppText>
            </Pressable>
            <Pressable
              onPress={w.useCurrentLocation}
              className="flex-row items-center gap-2 py-1 active:opacity-70"
            >
              <Icon name="locate-outline" size={16} tone="primary" />
              <AppText className="text-[13px] text-primary">
                Current location
              </AppText>
            </Pressable>
          </View>
          {w.address && w.coords ? (
            <AppText className="text-[12px] text-muted-foreground">
              Selected: {w.address}
            </AppText>
          ) : (
            <AppText className="text-[12px] text-destructive">
              Re-pick the location so the update keeps valid coordinates.
            </AppText>
          )}
        </View>
      </Field>

      <Button
        title={w.isSavingDetails ? "Saving…" : "Save details"}
        loading={w.isSavingDetails}
        disabled={w.isSavingDetails}
        onPress={onSaveDetails}
      />

      <View className="h-px bg-border" />

      {/* Status */}
      <View className="gap-3">
        <AppText variant="label">Status</AppText>
        <View className="flex-row flex-wrap gap-2">
          {STATUS_OPTIONS.map((o) => (
            <Chip
              key={o.label}
              label={o.label}
              active={o.value === w.status}
              onPress={() => onPickStatus(o.value)}
            />
          ))}
        </View>
        {w.status ? (
          <Field
            label="Note for visitors"
            hint="Optional — reason, reopening date"
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
          <AppText className="text-[12px] text-muted-foreground">
            Saving status…
          </AppText>
        ) : null}
      </View>

      <View className="h-px bg-border" />

      {/* Weekly hours */}
      <View className="gap-3">
        <AppText variant="label">Weekly hours</AppText>
        {w.hours.map((h) => (
          <View
            key={h.dayOfWeek}
            className="gap-2 rounded-xl border border-border bg-card p-3"
          >
            <View className="flex-row items-center justify-between">
              <AppText className="text-[14px] font-semibold text-foreground">
                {DAY_LABELS[h.dayOfWeek]}
              </AppText>
              <Switch
                value={!h.isClosed}
                onValueChange={(open) =>
                  w.setHours(h.dayOfWeek, { isClosed: !open })
                }
              />
            </View>
            {!h.isClosed ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input
                    value={h.openTime ?? ""}
                    onChangeText={(v) =>
                      w.setHours(h.dayOfWeek, { openTime: v })
                    }
                    placeholder="09:00"
                    keyboardType="numbers-and-punctuation"
                    invalid={!TIME_RE.test(h.openTime ?? "")}
                  />
                </View>
                <View className="flex-1">
                  <Input
                    value={h.closeTime ?? ""}
                    onChangeText={(v) =>
                      w.setHours(h.dayOfWeek, { closeTime: v })
                    }
                    placeholder="17:00"
                    keyboardType="numbers-and-punctuation"
                    invalid={!TIME_RE.test(h.closeTime ?? "")}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ))}
        <Button
          title={w.isSavingHours ? "Saving…" : "Save hours"}
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
    </ScrollView>
  );
}
