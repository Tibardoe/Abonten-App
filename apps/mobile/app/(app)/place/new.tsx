import { usePlaceCategories } from "@/features/discovery/usePlaceCategories";
import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import { useCreatePlace } from "@/features/places/useCreatePlace";
import { uuidv4 } from "@/lib/uuid";
import type { PlaceOpeningHoursInput } from "@abonten/api-client";
import {
  AppText,
  Button,
  Field,
  Icon,
  Input,
  ScreenLoader,
} from "@abonten/ui-native";
import { getPlaceSchema } from "@abonten/validation/placeSchema";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";

// Native echo of the web PlaceUploadModal (Places Milestone 3): a 4-step
// wizard — Basic Info, Cover Photo, Hours, Review — that publishes a place
// via useCreatePlace (signed Cloudinary upload + POST /api/mobile/places →
// the same postPlaceCore the web postPlace action runs). Save-as-draft is a
// later chunk (WP-4g); this is create-only.

const STEP_TITLES = [
  "Create place · Basic info",
  "Create place · Cover photo",
  "Create place · Hours",
  "Create place · Review",
];

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// A place starts open every day 09:00–17:00 — a sensible default the owner
// edits on the Hours step, mirroring the web DEFAULT_OPENING_HOURS.
const DEFAULT_OPENING_HOURS: PlaceOpeningHoursInput[] = Array.from(
  { length: 7 },
  (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: "09:00",
    closeTime: "17:00",
    isClosed: false,
  }),
);

const PLACE_MESSAGES = {
  nameRequired: "Give your place a name.",
  nameTooLong: "That name is too long (max 150 characters).",
  descriptionRequired: "Add a short description.",
  descriptionTooLong: "That description is too long (max 2000 characters).",
  invalidUrl: "Enter a valid website URL.",
  invalidPhone: "Enter a valid phone number.",
  invalidWhatsapp: "Enter a valid WhatsApp number.",
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type TextErrors = Partial<
  Record<"name" | "description" | "website_url" | "phone" | "whatsapp", string>
>;

export default function CreatePlaceScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const categoriesQuery = usePlaceCategories();
  const autocomplete = usePlacesAutocomplete();
  const create = useCreatePlace();

  const clientRequestId = useRef(uuidv4()).current;
  const placeSchema = useMemo(() => getPlaceSchema(PLACE_MESSAGES), []);

  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [textErrors, setTextErrors] = useState<TextErrors>({});

  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [resolvingLocation, setResolvingLocation] = useState(false);

  const [coverUri, setCoverUri] = useState<string | null>(null);

  const [openingHours, setOpeningHours] = useState<PlaceOpeningHoursInput[]>(
    DEFAULT_OPENING_HOURS,
  );

  useEffect(() => {
    navigation.setOptions({ title: STEP_TITLES[step] });
  }, [navigation, step]);

  const categories = categoriesQuery.data ?? [];

  function validateText(): boolean {
    const result = placeSchema.safeParse({
      name,
      description,
      website_url: website,
      phone,
      whatsapp,
    });
    if (result.success) {
      setTextErrors({});
      return true;
    }
    const next: TextErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof TextErrors;
      if (key && !next[key]) next[key] = issue.message;
    }
    setTextErrors(next);
    return false;
  }

  async function pickSuggestion(placeId: string) {
    setResolvingLocation(true);
    const resolved = await autocomplete.resolvePlace(placeId);
    setResolvingLocation(false);
    if (!resolved) {
      Alert.alert(
        "Couldn't use that location",
        "Please try another suggestion or type the address.",
      );
      return;
    }
    setAddress(resolved.address);
    setCoords({ lat: resolved.lat, lng: resolved.lng });
    autocomplete.setQuery(resolved.address);
    autocomplete.clear();
  }

  async function useCurrentLocation() {
    setResolvingLocation(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Location access needed",
          "Allow location access to use your current position.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const label = place
        ? [place.name, place.street, place.city, place.region, place.country]
            .filter(Boolean)
            .join(", ")
        : `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      setAddress(label);
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      autocomplete.setQuery(label);
      autocomplete.clear();
    } catch {
      Alert.alert(
        "Couldn't get your location",
        "Please try again or type the address.",
      );
    } finally {
      setResolvingLocation(false);
    }
  }

  async function pickCover() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to pick a cover photo.",
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setCoverUri(picked.assets[0].uri);
  }

  function setHours(dayOfWeek: number, patch: Partial<PlaceOpeningHoursInput>) {
    setOpeningHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)),
    );
  }

  const hoursComplete = openingHours.every(
    (h) =>
      h.isClosed ||
      (!!h.openTime &&
        !!h.closeTime &&
        TIME_RE.test(h.openTime) &&
        TIME_RE.test(h.closeTime)),
  );

  function goNextFromBasics() {
    const textOk = validateText();
    if (!textOk) return;
    if (categoryId === null) {
      Alert.alert("Pick a category", "Choose the category that fits best.");
      return;
    }
    if (!address || !coords) {
      Alert.alert(
        "Add a location",
        "Pick a suggestion or use your current location so people can find this place.",
      );
      return;
    }
    setStep(1);
  }

  async function publish() {
    if (categoryId === null || !coords || !coverUri) return;
    if (!hoursComplete) {
      Alert.alert(
        "Check your hours",
        "Every open day needs an open and close time in HH:MM format.",
      );
      return;
    }

    const res = await create.mutateAsync({
      name: name.trim(),
      categoryId,
      description: description.trim(),
      address: address.trim(),
      latitude: coords.lat,
      longitude: coords.lng,
      coverUri,
      openingHours,
      websiteUrl: website.trim() || null,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      clientRequestId,
    });

    if (res.status === 200 && "placeId" in res) {
      Alert.alert("Place published", "Your place is now live.", [
        {
          text: "View it",
          onPress: () => router.replace(`/(app)/place/${res.placeId}`),
        },
      ]);
      return;
    }

    Alert.alert(
      "Couldn't publish",
      res.message ?? "Something went wrong. Please try again.",
    );
  }

  if (categoriesQuery.isLoading) return <ScreenLoader />;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      <StepDots step={step} total={4} />

      {step === 0 ? (
        <View className="gap-4">
          <Field label="Name" error={textErrors.name}>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="e.g. The Roastery Coffee Bar"
            />
          </Field>

          <Field label="Category">
            <View className="flex-row flex-wrap gap-2">
              {categories.map((cat) => {
                const active = cat.id === categoryId;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setCategoryId(cat.id)}
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
                      {cat.name}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Description" error={textErrors.description}>
            <Input
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              style={{ minHeight: 96, textAlignVertical: "top" }}
              placeholder="What should visitors know about this place?"
            />
          </Field>

          <Field
            label="Location"
            hint="Search for the address, or use your current location."
          >
            <Input
              value={autocomplete.query}
              onChangeText={autocomplete.setQuery}
              placeholder="Start typing an address…"
              autoCorrect={false}
            />
            {resolvingLocation ? (
              <View className="flex-row items-center gap-2 py-1">
                <ActivityIndicator size="small" />
                <AppText className="text-[12px] text-muted-foreground">
                  Resolving location…
                </AppText>
              </View>
            ) : null}
            {autocomplete.predictions.length > 0 ? (
              <View className="overflow-hidden rounded-lg border border-border">
                {autocomplete.predictions.map((p) => (
                  <Pressable
                    key={p.placeId}
                    onPress={() => pickSuggestion(p.placeId)}
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
            <Pressable
              onPress={useCurrentLocation}
              className="flex-row items-center gap-2 py-1 active:opacity-70"
            >
              <Icon name="locate-outline" size={16} tone="primary" />
              <AppText className="text-[13px] text-primary">
                Use my current location
              </AppText>
            </Pressable>
            {address && coords ? (
              <AppText className="text-[12px] text-muted-foreground">
                Selected: {address}
              </AppText>
            ) : null}
          </Field>

          <Field label="Website" error={textErrors.website_url} hint="Optional">
            <Input
              value={website}
              onChangeText={setWebsite}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://example.com"
            />
          </Field>

          <Field label="Phone" error={textErrors.phone} hint="Optional">
            <Input
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+233…"
            />
          </Field>

          <Field label="WhatsApp" error={textErrors.whatsapp} hint="Optional">
            <Input
              value={whatsapp}
              onChangeText={setWhatsapp}
              keyboardType="phone-pad"
              placeholder="+233…"
            />
          </Field>

          <Button title="Next" onPress={goNextFromBasics} />
        </View>
      ) : null}

      {step === 1 ? (
        <View className="gap-4">
          <AppText variant="label">Cover photo</AppText>
          {coverUri ? (
            <Image
              source={{ uri: coverUri }}
              style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12 }}
              contentFit="cover"
            />
          ) : (
            <View className="aspect-[16/9] w-full items-center justify-center rounded-xl border border-border border-dashed bg-muted">
              <Icon name="image-outline" size={28} tone="muted" />
              <AppText className="mt-2 text-[12px] text-muted-foreground">
                No photo yet
              </AppText>
            </View>
          )}
          <Button
            title={coverUri ? "Replace photo" : "Choose photo"}
            variant="outline"
            onPress={pickCover}
          />
          <View className="flex-row gap-3">
            <Button
              title="Back"
              variant="ghost"
              className="flex-1"
              onPress={() => setStep(0)}
            />
            <Button
              title="Next"
              className="flex-1"
              disabled={!coverUri}
              onPress={() => setStep(2)}
            />
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View className="gap-3">
          <AppText variant="label">Opening hours</AppText>
          {openingHours.map((h) => (
            <View
              key={h.dayOfWeek}
              className="gap-2 rounded-xl border border-border bg-card p-3"
            >
              <View className="flex-row items-center justify-between">
                <AppText className="text-[14px] font-semibold text-foreground">
                  {DAY_LABELS[h.dayOfWeek]}
                </AppText>
                <Pressable
                  onPress={() =>
                    setHours(h.dayOfWeek, { isClosed: !h.isClosed })
                  }
                  className={
                    h.isClosed
                      ? "rounded-full border border-border px-3 py-1"
                      : "rounded-full bg-primary px-3 py-1"
                  }
                >
                  <AppText
                    className={
                      h.isClosed
                        ? "text-[12px] font-medium text-muted-foreground"
                        : "text-[12px] font-semibold text-primary-foreground"
                    }
                  >
                    {h.isClosed ? "Closed" : "Open"}
                  </AppText>
                </Pressable>
              </View>
              {!h.isClosed ? (
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Input
                      value={h.openTime ?? ""}
                      onChangeText={(v) =>
                        setHours(h.dayOfWeek, { openTime: v })
                      }
                      placeholder="09:00"
                      keyboardType="numbers-and-punctuation"
                      invalid={!!h.openTime && !TIME_RE.test(h.openTime)}
                    />
                  </View>
                  <View className="flex-1">
                    <Input
                      value={h.closeTime ?? ""}
                      onChangeText={(v) =>
                        setHours(h.dayOfWeek, { closeTime: v })
                      }
                      placeholder="17:00"
                      keyboardType="numbers-and-punctuation"
                      invalid={!!h.closeTime && !TIME_RE.test(h.closeTime)}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ))}
          <View className="flex-row gap-3">
            <Button
              title="Back"
              variant="ghost"
              className="flex-1"
              onPress={() => setStep(1)}
            />
            <Button
              title="Next"
              className="flex-1"
              disabled={!hoursComplete}
              onPress={() => setStep(3)}
            />
          </View>
        </View>
      ) : null}

      {step === 3 ? (
        <View className="gap-4">
          {coverUri ? (
            <Image
              source={{ uri: coverUri }}
              style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12 }}
              contentFit="cover"
            />
          ) : null}
          <View className="gap-2 rounded-xl border border-border bg-card p-4">
            <ReviewRow label="Name" value={name} />
            <ReviewRow
              label="Category"
              value={categories.find((c) => c.id === categoryId)?.name ?? "—"}
            />
            <ReviewRow label="Location" value={address} />
            {website ? <ReviewRow label="Website" value={website} /> : null}
            {phone ? <ReviewRow label="Phone" value={phone} /> : null}
            {whatsapp ? <ReviewRow label="WhatsApp" value={whatsapp} /> : null}
            <ReviewRow
              label="Open days"
              value={openingHours
                .filter((h) => !h.isClosed)
                .map((h) => DAY_LABELS[h.dayOfWeek].slice(0, 3))
                .join(", ")}
            />
          </View>
          <AppText className="text-[13px] text-muted-foreground">
            {description}
          </AppText>

          {create.isError ? (
            <AppText className="text-[13px] text-destructive">
              We couldn't publish your place. Please try again.
            </AppText>
          ) : null}

          <View className="flex-row gap-3">
            <Button
              title="Back"
              variant="ghost"
              className="flex-1"
              onPress={() => setStep(2)}
            />
            <Button
              title={create.isPending ? "Publishing…" : "Publish"}
              className="flex-1"
              loading={create.isPending}
              onPress={publish}
            />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View className="flex-row justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length step indicator
          key={i}
          className={`h-1.5 rounded-full ${
            i === step ? "w-6 bg-primary" : "w-1.5 bg-border"
          }`}
        />
      ))}
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <AppText className="text-[13px] text-muted-foreground">{label}</AppText>
      <AppText className="flex-1 text-right text-[13px] text-foreground">
        {value || "—"}
      </AppText>
    </View>
  );
}
