import { DateRangeField } from "@/components/explore/DateRangeField";
import { MapPickerSheet } from "@/components/explore/MapPickerSheet";
import { useEventEdit } from "@/features/events/useEventEdit";
import { TIME_RE, prettyDate } from "@/lib/datetime";
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

export default function EditEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const w = useEventEdit(eventId ?? "");
  const [mapOpen, setMapOpen] = useState(false);

  if (w.isLoading || !w.isReady) {
    if (w.loadError) {
      return (
        <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
          <AppText className="text-center text-muted-foreground">
            {typeof w.loadError === "string"
              ? w.loadError
              : "Couldn't load this event."}
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

  const flyerPreview = w.newFlyerUri
    ? w.newFlyerUri
    : w.existingFlyer
      ? buildCloudinaryUrl(w.existingFlyer.publicId, w.existingFlyer.version, {
          width: 400,
          height: 500,
        })
      : null;

  async function onSave() {
    const res = await w.save();
    if (!res) return;
    if (res.status === 200) {
      Alert.alert("Saved", "Your event has been updated.");
      router.back();
    } else {
      Alert.alert("Couldn't save", res.message ?? "Please try again.");
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      {w.locked ? (
        <View className="rounded-xl border border-border bg-muted p-3">
          <AppText className="text-[12px] text-muted-foreground">
            This event already has confirmed tickets, so its dates, location and
            capacity are locked. You can still edit the title, description,
            category, website, flyer and registration setting.
          </AppText>
        </View>
      ) : null}

      {/* Basics */}
      <Field label="Title" error={w.textErrors.title}>
        <Input value={w.title} onChangeText={w.setTitle} />
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
              key={c}
              label={c}
              active={c === w.category}
              onPress={() => w.selectCategory(c)}
            />
          ))}
        </View>
      </Field>

      {w.category ? (
        <Field label="Types" hint="Pick one or more">
          <View className="flex-row flex-wrap gap-2">
            {w.categoryTypes.map((t) => (
              <Chip
                key={t}
                label={t}
                active={w.types.includes(t)}
                onPress={() => w.toggleType(t)}
              />
            ))}
          </View>
        </Field>
      ) : null}

      <Field
        label="Capacity"
        error={w.textErrors.capacity}
        hint={
          w.locked
            ? "Locked — this event has confirmed tickets."
            : "Optional — total attendees allowed"
        }
      >
        <Input
          value={w.capacity}
          onChangeText={w.setCapacity}
          keyboardType="number-pad"
          editable={!w.locked}
        />
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

      <View className="flex-row items-center justify-between rounded-xl border border-border bg-card p-3">
        <View className="flex-1 pr-3">
          <AppText className="text-[14px] font-semibold text-foreground">
            Require registration
          </AppText>
          <AppText className="text-[12px] text-muted-foreground">
            Attendees must register even for a free event.
          </AppText>
        </View>
        <Switch
          value={w.requireRegistration}
          onValueChange={w.setRequireRegistration}
        />
      </View>

      {/* Flyer */}
      <Field label="Flyer">
        <View className="gap-2">
          {flyerPreview ? (
            <Image
              source={{ uri: flyerPreview }}
              style={{ width: 128, height: 160, borderRadius: 10 }}
              contentFit="cover"
              transition={150}
            />
          ) : null}
          <Button
            title={w.newFlyerUri ? "Choose a different flyer" : "Change flyer"}
            variant="outline"
            size="sm"
            onPress={w.pickFlyer}
          />
        </View>
      </Field>

      {/* Schedule */}
      <View className="gap-3">
        <AppText variant="label">Schedule</AppText>
        {w.locked ? (
          <AppText className="text-[12px] text-muted-foreground">
            Locked — this event has confirmed tickets.
          </AppText>
        ) : (
          <View className="flex-row gap-2">
            <Chip
              label="Single event"
              active={w.scheduleMode === "single"}
              onPress={() => w.setScheduleMode("single")}
            />
            <Chip
              label="Multiple dates"
              active={w.scheduleMode === "specific"}
              onPress={() => w.setScheduleMode("specific")}
            />
          </View>
        )}

        {w.scheduleMode === "single" ? (
          <View className="gap-3">
            {!w.locked ? (
              <Field label="Dates" hint="Tap a start day, then an end day">
                <DateRangeField
                  start={w.rangeStart}
                  end={w.rangeEnd}
                  onChange={w.setRange}
                />
              </Field>
            ) : w.rangeStart ? (
              <AppText className="text-[13px] text-foreground">
                {prettyDate(w.rangeStart)}
                {w.rangeEnd && w.rangeEnd !== w.rangeStart
                  ? ` – ${prettyDate(w.rangeEnd)}`
                  : ""}
              </AppText>
            ) : null}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Start time">
                  <Input
                    value={w.rangeStartTime}
                    onChangeText={w.setRangeStartTime}
                    keyboardType="numbers-and-punctuation"
                    editable={!w.locked}
                    invalid={!TIME_RE.test(w.rangeStartTime)}
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="End time">
                  <Input
                    value={w.rangeEndTime}
                    onChangeText={w.setRangeEndTime}
                    keyboardType="numbers-and-punctuation"
                    editable={!w.locked}
                    invalid={!TIME_RE.test(w.rangeEndTime)}
                  />
                </Field>
              </View>
            </View>
          </View>
        ) : (
          <View className="gap-2">
            {w.occurrences.map((o, i) => (
              <View
                key={o.id}
                className="flex-row items-center justify-between rounded-xl border border-border bg-card p-3"
              >
                <AppText className="text-[13px] text-foreground">
                  {prettyDate(o.dateIso)} · {o.start}–{o.end}
                </AppText>
                {!w.locked ? (
                  <Pressable
                    onPress={() =>
                      w.setOccurrences((prev) =>
                        prev.filter((_, idx) => idx !== i),
                      )
                    }
                  >
                    <AppText className="text-[12px] text-destructive">
                      Remove
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Location */}
      <Field
        label="Location"
        hint={
          w.locked
            ? "Locked — this event has confirmed tickets."
            : "Search, choose on the map, or use your current location."
        }
      >
        {w.locked ? (
          <AppText className="text-[13px] text-foreground">{w.address}</AppText>
        ) : (
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
            ) : null}
          </View>
        )}
      </Field>

      <Button
        title={w.isSaving ? "Saving…" : "Save changes"}
        loading={w.isSaving}
        disabled={w.isSaving}
        onPress={onSave}
      />

      <MapPickerSheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initial={w.coords}
        onPick={(loc) => w.setMapLocation(loc)}
      />
    </ScrollView>
  );
}
