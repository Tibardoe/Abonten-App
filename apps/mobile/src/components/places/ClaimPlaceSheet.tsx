import { useSession } from "@/auth/SessionProvider";
import { QueuedWriteNotice } from "@/components/QueuedWriteNotice";
import {
  CLAIM_DOC_MAX_FILES,
  type StagedClaimDoc,
  guessMime,
  uploadClaimDocument,
  useSubmitPlaceClaim,
  validateClaimDoc,
} from "@/features/places/usePlaceClaim";
import { uuidv4 } from "@/lib/uuid";
import { formatFileSize } from "@abonten/core/i18n/format";
import {
  AppText,
  Button,
  Field,
  Icon,
  Input,
  Sheet,
  Spinner,
  useToast,
} from "@abonten/ui-native";
import { getCurrentLocale, useTranslations } from "@abonten/ui-native/i18n";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

// Native echo of the web ClaimPlaceModal + §12 supporting documents.
// Submitting only ever creates a pending place_claim_request row — an admin
// reviews it before ownership changes. Optional note + contact phone/email
// (same as web), plus up to three private "proof of ownership" attachments
// (photo or PDF) that upload to the private place-claim-documents bucket
// once the claim row exists.

type Phase = "form" | "uploading" | "done";

function humanSize(bytes: number | null): string {
  if (bytes == null) return "";
  return formatFileSize(bytes, getCurrentLocale());
}

function DocRow({
  doc,
  onRemove,
  onRetry,
}: {
  doc: StagedClaimDoc;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("places");

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-2.5">
      {doc.isImage ? (
        <Image
          source={{ uri: doc.uri }}
          style={{ width: 40, height: 40, borderRadius: 8 }}
          contentFit="cover"
        />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon name="document-text-outline" size={20} tone="muted" />
        </View>
      )}
      <View className="flex-1">
        <AppText variant="small" numberOfLines={1} className="font-medium">
          {doc.name}
        </AppText>
        <AppText variant="caption">
          {doc.status === "uploading"
            ? t("uploading")
            : doc.status === "done"
              ? t("uploaded")
              : doc.status === "error"
                ? (doc.error ?? t("uploadFailed"))
                : humanSize(doc.sizeBytes)}
        </AppText>
      </View>
      {doc.status === "uploading" ? (
        <Spinner />
      ) : doc.status === "done" ? (
        <Icon name="checkmark-circle" size={20} tone="success" />
      ) : doc.status === "error" ? (
        <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
          <AppText variant="small" tone="brand" className="font-semibold">
            {t("retry")}
          </AppText>
        </Pressable>
      ) : (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("remove", { name: doc.name })}
        >
          <Icon name="close" size={18} tone="muted" />
        </Pressable>
      )}
    </View>
  );
}

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
  const t = useTranslations("places");

  const toast = useToast();
  const { session } = useSession();
  const userId = session?.user.id;
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [docs, setDocs] = useState<StagedClaimDoc[]>([]);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const claimIdRef = useRef<string | null>(null);
  const submit = useSubmitPlaceClaim(placeId);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setPhone("");
    setEmail("");
    setDocs([]);
    setPhase("form");
    setError(null);
    claimIdRef.current = null;
  }, [open]);

  function stage(candidate: Omit<StagedClaimDoc, "key" | "status">) {
    setError(null);
    if (docs.length >= CLAIM_DOC_MAX_FILES) {
      setError(
        t("youCanAttachUpToDocuments", {
          CLAIM_DOC_MAX_FILES: CLAIM_DOC_MAX_FILES,
        }),
      );
      return;
    }
    const problem = validateClaimDoc(candidate);
    if (problem) {
      setError(problem);
      return;
    }
    setDocs((prev) => [
      ...prev,
      { ...candidate, key: uuidv4(), status: "queued" },
    ]);
  }

  async function addPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error(t("photoAccessNeeded"), {
        description: t("allowPhotoAccessToAttachA"),
      });
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const a = picked.assets[0];
    const name = a.fileName ?? `photo-${Date.now()}.jpg`;
    stage({
      uri: a.uri,
      name,
      mimeType: guessMime(a.uri, name, a.mimeType ?? undefined, "image/jpeg"),
      sizeBytes: typeof a.fileSize === "number" ? a.fileSize : null,
      isImage: true,
    });
  }

  async function addFile() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const a = picked.assets[0];
    const name = a.name ?? `document-${Date.now()}`;
    const mime = guessMime(
      a.uri,
      name,
      a.mimeType ?? undefined,
      "application/octet-stream",
    );
    stage({
      uri: a.uri,
      name,
      mimeType: mime,
      sizeBytes: typeof a.size === "number" ? a.size : null,
      isImage: mime.startsWith("image/"),
    });
  }

  function removeDoc(key: string) {
    setDocs((prev) => prev.filter((d) => d.key !== key));
  }

  async function runUpload(list: StagedClaimDoc[]) {
    const claimId = claimIdRef.current;
    if (!claimId || !userId) return;
    for (const doc of list) {
      if (doc.status === "done") continue;
      setDocs((prev) =>
        prev.map((d) =>
          d.key === doc.key
            ? { ...d, status: "uploading", error: undefined }
            : d,
        ),
      );
      try {
        await uploadClaimDocument(userId, claimId, doc);
        setDocs((prev) =>
          prev.map((d) => (d.key === doc.key ? { ...d, status: "done" } : d)),
        );
      } catch (e) {
        setDocs((prev) =>
          prev.map((d) =>
            d.key === doc.key
              ? {
                  ...d,
                  status: "error",
                  error:
                    e instanceof Error ? e.message : t("uploadFailedRetry"),
                }
              : d,
          ),
        );
      }
    }
    setPhase("done");
  }

  function retry(key: string) {
    const doc = docs.find((d) => d.key === key);
    if (doc) runUpload([doc]);
  }

  function onSubmit() {
    setError(null);
    submit.mutate(
      { note, contactPhone: phone, contactEmail: email },
      {
        onSuccess: ({ claimId }) => {
          claimIdRef.current = claimId;
          if (docs.length === 0) {
            setPhase("done");
          } else {
            setPhase("uploading");
            runUpload(docs);
          }
        },
        onError: (e) =>
          setError(e instanceof Error ? e.message : t("somethingWentWrong2")),
      },
    );
  }

  const failedCount = docs.filter((d) => d.status === "error").length;
  const uploadingBusy = phase === "uploading";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("claim", { placeName: placeName })}
      minHeightRatio={0.6}
      footer={
        phase === "done" ? (
          <Button title={t("done")} onPress={onClose} />
        ) : (
          <View className="gap-2">
            {submit.isPaused ? <QueuedWriteNotice /> : null}
            <Button
              title={
                submit.isPaused
                  ? t("waitingForConnection")
                  : submit.isPending
                    ? t("submitting2")
                    : uploadingBusy
                      ? t("uploadingDocuments")
                      : t("submitClaim2")
              }
              onPress={onSubmit}
              disabled={submit.isPending || uploadingBusy}
            />
          </View>
        )
      }
    >
      {phase === "done" ? (
        <View className="items-center gap-3 py-4">
          <Icon name="checkmark-circle" size={44} tone="success" />
          <AppText variant="bodyStrong" className="text-center">
            {t("claimRequestSubmitted")}
          </AppText>
          <AppText variant="muted" className="text-center">
            {t("claimReviewNote", {
              documents: docs.length > 0 ? "yes" : "no",
            })}
          </AppText>
          {failedCount > 0 ? (
            <View className="w-full gap-2 pt-2">
              <AppText variant="small" tone="error" className="text-center">
                {t("document", { failedCount })}
              </AppText>
              {docs
                .filter((d) => d.status === "error")
                .map((d) => (
                  <DocRow
                    key={d.key}
                    doc={d}
                    onRemove={() => removeDoc(d.key)}
                    onRetry={() => retry(d.key)}
                  />
                ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View className="gap-4">
          <View className="flex-row gap-2 rounded-xl border border-border bg-card p-3">
            <Icon name="shield-checkmark-outline" size={18} tone="muted" />
            <AppText variant="small" tone="muted" className="flex-1">
              {t("claimingLetsYouManageThisPlace")}
            </AppText>
          </View>

          <Field label={t("whyAreYouTheOwnerOptional")}>
            <Input
              value={note}
              onChangeText={setNote}
              placeholder={t("tellUsHowYouReConnected")}
              multiline
              numberOfLines={4}
              maxLength={1000}
              style={{ minHeight: 90, textAlignVertical: "top" }}
            />
          </Field>

          {/* §12 — supporting documents */}
          <View className="gap-2">
            <AppText variant="label">
              {t("proofOfOwnershipAuthorizationOptional")}
            </AppText>
            <AppText variant="caption">
              {t("aBusinessRegistrationAUtilityBill", {
                CLAIM_DOC_MAX_FILES: CLAIM_DOC_MAX_FILES,
              })}
            </AppText>

            {docs.map((d) => (
              <DocRow
                key={d.key}
                doc={d}
                onRemove={() => removeDoc(d.key)}
                onRetry={() => retry(d.key)}
              />
            ))}

            {docs.length < CLAIM_DOC_MAX_FILES && phase === "form" ? (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button
                    title={t("addPhoto")}
                    variant="outline"
                    size="sm"
                    onPress={addPhoto}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    title={t("addFile")}
                    variant="outline"
                    size="sm"
                    onPress={addFile}
                  />
                </View>
              </View>
            ) : null}
          </View>

          <Field label={t("contactPhoneOptional")}>
            <Input
              value={phone}
              onChangeText={setPhone}
              placeholder={t("eG0240000000")}
              keyboardType="phone-pad"
            />
          </Field>

          <Field label={t("contactEmailOptional")}>
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
