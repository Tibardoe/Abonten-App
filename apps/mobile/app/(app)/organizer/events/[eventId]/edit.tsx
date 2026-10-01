import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { TimeField, prettyTime } from "@/components/datetime/TimeField";
import { DateRangeField } from "@/components/explore/DateRangeField";
import { MapPickerSheet } from "@/components/explore/MapPickerSheet";
import { FormSkeleton } from "@/components/skeletons";
import { useEventEdit } from "@/features/events/useEventEdit";
import { TIME_RE, prettyDate } from "@/lib/datetime";
import { uuidv4 as makeId } from "@/lib/uuid";
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
  SegmentedTabs,
  useToast,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Switch, View } from "react-native";

export default function EditEventScreen() {
  const t = useTranslations("manage");

  const toast = useToast();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const w = useEventEdit(eventId ?? "");
  const [mapOpen, setMapOpen] = useState(false);

  if (!w.isReady) {
    // A definite answer from the server (not yours, no such event) keeps
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
            subject={t("thisEvent")}
            onRetry={() => w.reload()}
          />
        </View>
      );
    }
    return <FormSkeleton fields={6} />;
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
      toast.success(t("saved"), { description: t("yourEventHasBeenUpdated") });
      router.back();
    } else {
      toast.error(t("couldnTSave"), {
        description: res.message ?? t("pleaseTryAgain"),
      });
    }
  }

  async function onSaveTicketTypes() {
    const res = await w.saveTicketTypes();
    if (!res) return;
    if (res.status === 200) {
      toast.success(t("ticketTypesUpdated"));
    } else {
      toast.error(res.message ?? t("weCouldnTSaveYourTicket"), {
        description: t("yourChangesAreStillOnScreen"),
        action: { label: t("retry"), onPress: onSaveTicketTypes },
      });
    }
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      {w.locked ? (
        <View className="rounded-xl border border-border bg-muted p-3">
          <AppText variant="meta">
            {t("thisEventAlreadyHasConfirmedTickets")}
          </AppText>
        </View>
      ) : null}

      {/* Basics */}
      <Field label={t("title")} error={w.textErrors.title}>
        <Input value={w.title} onChangeText={w.setTitle} />
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
              key={c}
              label={c}
              selected={c === w.category}
              onPress={() => w.selectCategory(c)}
            />
          ))}
        </View>
      </Field>

      {w.category ? (
        <Field label={t("types")} hint={t("pickOneOrMore")}>
          <View className="flex-row flex-wrap gap-2">
            {w.categoryTypes.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={w.types.includes(item)}
                onPress={() => w.toggleType(item)}
              />
            ))}
          </View>
        </Field>
      ) : null}

      <Field
        label={t("capacity2")}
        error={w.textErrors.capacity}
        hint={
          w.locked
            ? t("lockedThisEventHasConfirmedTickets")
            : t("optionalTotalAttendeesAllowed")
        }
      >
        <Input
          value={w.capacity}
          onChangeText={w.setCapacity}
          keyboardType="number-pad"
          editable={!w.locked}
        />
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

      <View className="flex-row items-center justify-between rounded-xl border border-border bg-card p-3">
        <View className="flex-1 pr-3">
          <AppText variant="bodyStrong">{t("requireRegistration")}</AppText>
          <AppText variant="meta">{t("attendeesMustRegisterEvenForA")}</AppText>
        </View>
        <Switch
          value={w.requireRegistration}
          onValueChange={w.setRequireRegistration}
        />
      </View>

      {/* Flyer */}
      <Field label={t("flyer")}>
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
            title={
              w.newFlyerUri ? t("chooseADifferentFlyer") : t("changeFlyer")
            }
            variant="outline"
            size="sm"
            onPress={w.pickFlyer}
          />
        </View>
      </Field>

      {/* Schedule */}
      <View className="gap-3">
        <AppText variant="label">{t("schedule")}</AppText>
        {w.locked ? (
          <AppText variant="meta">
            {t("lockedThisEventHasConfirmedTickets")}
          </AppText>
        ) : (
          <View className="flex-row gap-2">
            <Chip
              label={t("singleEvent")}
              selected={w.scheduleMode === "single"}
              onPress={() => w.setScheduleMode("single")}
            />
            <Chip
              label={t("multipleDates")}
              selected={w.scheduleMode === "specific"}
              onPress={() => w.setScheduleMode("specific")}
            />
          </View>
        )}

        {w.scheduleMode === "single" ? (
          <View className="gap-3">
            {!w.locked ? (
              <View className="gap-3">
                <SegmentedTabs
                  options={[
                    { key: "single", label: t("singleDate") },
                    { key: "range", label: t("dateRange") },
                  ]}
                  value={w.dateMode}
                  onChange={w.setDateMode}
                />
                {w.dateMode === "single" ? (
                  <Field
                    label={t("eventDate")}
                    hint={t("tapTheDayYourEventHappens")}
                  >
                    <DateRangeField
                      mode="single"
                      start={w.rangeStart}
                      end={null}
                      onChange={(r) =>
                        w.setRange({ start: r.start, end: null })
                      }
                    />
                  </Field>
                ) : (
                  <Field
                    label={t("startEndDate")}
                    hint={t("tapTheFirstDayThenThe")}
                  >
                    <DateRangeField
                      start={w.rangeStart}
                      end={w.rangeEnd}
                      onChange={w.setRange}
                    />
                  </Field>
                )}
              </View>
            ) : w.rangeStart ? (
              <AppText variant="small">
                {prettyDate(w.rangeStart)}
                {w.rangeEnd && w.rangeEnd !== w.rangeStart
                  ? ` – ${prettyDate(w.rangeEnd)}`
                  : ""}
              </AppText>
            ) : null}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label={t("startTime")}>
                  {w.locked ? (
                    <AppText variant="small">
                      {prettyTime(w.rangeStartTime)}
                    </AppText>
                  ) : (
                    <TimeField
                      label={t("startTime")}
                      value={w.rangeStartTime}
                      onChange={w.setRangeStartTime}
                      invalid={!TIME_RE.test(w.rangeStartTime)}
                    />
                  )}
                </Field>
              </View>
              <View className="flex-1">
                <Field label={t("endTime")}>
                  {w.locked ? (
                    <AppText variant="small">
                      {prettyTime(w.rangeEndTime)}
                    </AppText>
                  ) : (
                    <TimeField
                      label={t("endTime")}
                      value={w.rangeEndTime}
                      onChange={w.setRangeEndTime}
                      invalid={!TIME_RE.test(w.rangeEndTime)}
                    />
                  )}
                </Field>
              </View>
            </View>
          </View>
        ) : (
          <View className="gap-2">
            {w.occurrences.length > 0 ? (
              <AppText variant="overline">
                {t("date", { length: w.occurrences.length })}
                {w.occurrences.length === 1 ? "" : "s"}
              </AppText>
            ) : null}
            {[...w.occurrences]
              .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
              .map((o) => (
                <View
                  key={o.id}
                  className="flex-row items-center justify-between rounded-xl border border-border bg-card p-3"
                >
                  <AppText variant="small">
                    {prettyDate(o.dateIso)} · {o.start}–{o.end}
                  </AppText>
                  {!w.locked ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        w.setOccurrences((prev) =>
                          prev.filter((x) => x.id !== o.id),
                        )
                      }
                    >
                      <AppText variant="small" tone="error">
                        {t("remove")}
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
        label={t("location")}
        hint={
          w.locked
            ? t("lockedThisEventHasConfirmedTickets")
            : t("searchChooseOnTheMapOr")
        }
      >
        {w.locked ? (
          <AppText variant="small">{w.address}</AppText>
        ) : (
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
            ) : null}
          </View>
        )}
      </Field>

      <Button
        title={w.isSaving ? t("saving") : t("saveChanges")}
        loading={w.isSaving}
        disabled={w.isSaving}
        onPress={onSave}
      />

      <View className="h-px bg-border" />

      {/* Ticket types — a separate save, like the web Details tab */}
      <View className="gap-3">
        <AppText variant="label">{t("ticketTypes")}</AppText>
        {w.locked ? (
          <AppText variant="meta">
            {t("thisEventAlreadyHasConfirmedTickets2")}
          </AppText>
        ) : (
          <>
            <View className="flex-row gap-2">
              {(["free", "single", "multiple"] as const).map((m) => (
                <Chip
                  key={m}
                  label={
                    m === "free"
                      ? t("free")
                      : m === "single"
                        ? t("onePrice")
                        : t("multipleTypes")
                  }
                  selected={w.ticketMode === m}
                  onPress={() => w.setTicketMode(m)}
                />
              ))}
            </View>

            {w.ticketMode === "free" ? (
              <AppText variant="muted">
                {t("attendeesReserveAFreeTicketCapacity")}
              </AppText>
            ) : null}

            {w.ticketMode === "single" ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Field
                    label={t("price", { ticketCurrency: w.ticketCurrency })}
                  >
                    <Input
                      value={w.ticketPrice}
                      onChangeText={w.setTicketPrice}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label={t("quantity")} hint={t("optional")}>
                    <Input
                      value={w.ticketQuantity}
                      onChangeText={w.setTicketQuantity}
                      keyboardType="number-pad"
                      placeholder={t("unlimited")}
                    />
                  </Field>
                </View>
              </View>
            ) : null}

            {w.ticketMode === "multiple" ? (
              <View className="gap-3">
                {w.tiers.map((tier, i) => (
                  <View
                    key={tier.id}
                    className="gap-2 rounded-xl border border-border bg-card p-3"
                  >
                    <View className="flex-row items-center justify-between">
                      <AppText variant="small" className="font-semibold">
                        {t("ticketType")} {i + 1}
                      </AppText>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          w.setTiers((prev) =>
                            prev.filter((_, idx) => idx !== i),
                          )
                        }
                      >
                        <AppText variant="small" tone="error">
                          {t("remove")}
                        </AppText>
                      </Pressable>
                    </View>
                    <Input
                      value={tier.name}
                      onChangeText={(v) =>
                        w.setTiers((prev) =>
                          prev.map((x, idx) =>
                            idx === i ? { ...x, name: v } : x,
                          ),
                        )
                      }
                      placeholder={t("eGVip")}
                    />
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <Input
                          value={tier.price}
                          onChangeText={(v) =>
                            w.setTiers((prev) =>
                              prev.map((x, idx) =>
                                idx === i ? { ...x, price: v } : x,
                              ),
                            )
                          }
                          keyboardType="decimal-pad"
                          placeholder={t("price", {
                            ticketCurrency: w.ticketCurrency,
                          })}
                        />
                      </View>
                      <View className="flex-1">
                        <Input
                          value={tier.quantity}
                          onChangeText={(v) =>
                            w.setTiers((prev) =>
                              prev.map((x, idx) =>
                                idx === i ? { ...x, quantity: v } : x,
                              ),
                            )
                          }
                          keyboardType="number-pad"
                          placeholder={t("qtyOptional")}
                        />
                      </View>
                    </View>
                  </View>
                ))}
                <Button
                  title={t("addTicketType")}
                  variant="outline"
                  size="sm"
                  onPress={() =>
                    w.setTiers((prev) => [
                      ...prev,
                      { id: makeId(), name: "", price: "", quantity: "" },
                    ])
                  }
                />
              </View>
            ) : null}

            {/* Capacity (above) vs quantities, live
                (@abonten/core/ticketCapacity). */}
            {w.capacityProblem ? (
              <AppText
                variant="small"
                tone="error"
                accessibilityLiveRegion="polite"
              >
                {w.capacityProblem}
              </AppText>
            ) : w.capacityHint ? (
              <AppText variant="meta">{w.capacityHint}</AppText>
            ) : null}

            {w.ticketMode === "free" && !w.savedFree ? (
              <AppText variant="meta">
                {t("makingThisEventFreeRemovesIts")}
              </AppText>
            ) : null}

            <Button
              title={w.isSavingTicketTypes ? t("saving") : t("saveTicketTypes")}
              variant="secondary"
              loading={w.isSavingTicketTypes}
              disabled={w.isSavingTicketTypes || !!w.capacityProblem}
              onPress={onSaveTicketTypes}
            />
          </>
        )}
      </View>

      <MapPickerSheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initial={w.coords}
        onPick={(loc) => w.setMapLocation(loc)}
      />
    </KeyboardAwareScrollView>
  );
}
