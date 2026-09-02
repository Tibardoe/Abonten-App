import { useSubmitPlaceClaim } from "@/features/places/usePlaceClaim";
import { AppText, Button, Field, Icon, Input, Sheet } from "@abonten/ui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";

// Native echo of the web ClaimPlaceModal. Submitting only ever creates a
// pending place_claim_request row — an admin reviews it before ownership
// changes. Optional note + contact phone/email, same as web.
export function ClaimPlaceSheet({
  open,
  onClose,
  placeId,
  placeName,
}: {
  open: boolean;
  onClose: () => void;
  placeId: string;
  placeName: string;
}) {
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useSubmitPlaceClaim(placeId);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setPhone("");
    setEmail("");
    setSubmitted(false);
    setError(null);
  }, [open]);

  function onSubmit() {
    setError(null);
    submit.mutate(
      { note, contactPhone: phone, contactEmail: email },
      {
        onSuccess: () => setSubmitted(true),
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Something went wrong."),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Claim ${placeName}`}
      footer={
        submitted ? (
          <Button title="Done" onPress={onClose} />
        ) : (
          <Button
            title={submit.isPending ? "Submitting…" : "Submit claim"}
            onPress={onSubmit}
            disabled={submit.isPending}
          />
        )
      }
    >
      {submitted ? (
        <View className="items-center gap-3 py-4">
          <Icon name="checkmark-circle" size={44} tone="success" />
          <AppText variant="bodyStrong" className="text-center">
            Claim request submitted
          </AppText>
          <AppText variant="muted" className="text-center">
            An admin will review your request. You'll be notified once it's been
            looked at — ownership only changes after an approval.
          </AppText>
        </View>
      ) : (
        <View className="gap-4">
          <View className="flex-row gap-2 rounded-xl border border-border bg-card p-3">
            <Icon name="shield-checkmark-outline" size={18} tone="muted" />
            <AppText variant="small" tone="muted" className="flex-1">
              Claiming lets you manage this place if you're its rightful owner.
              An admin reviews every request before anything changes.
            </AppText>
          </View>

          <Field label="Why are you the owner? (optional)">
            <Input
              value={note}
              onChangeText={setNote}
              placeholder="Tell us how you're connected to this place"
              multiline
              numberOfLines={4}
              maxLength={1000}
              style={{ minHeight: 90, textAlignVertical: "top" }}
            />
          </Field>

          <Field label="Contact phone (optional)">
            <Input
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. 024 000 0000"
              keyboardType="phone-pad"
            />
          </Field>

          <Field label="Contact email (optional)">
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </Field>

          {error ? (
            <AppText variant="small" tone="error">
              {error}
            </AppText>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
