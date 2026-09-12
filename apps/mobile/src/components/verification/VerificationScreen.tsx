import {
  type StagedDoc,
  guessMime,
  uploadVerificationDoc,
  useStagedDocs,
  useSubjectVerification,
  useVerificationActions,
  validateDoc,
  verificationView,
} from "@/features/verification/useVerification";
import { uuidv4 } from "@/lib/uuid";
import {
  HOW_REVIEW_WORKS,
  ORGANIZER_TYPE_DESCRIPTION,
  ORGANIZER_TYPE_LABEL,
  VERIFICATION_CHIP_LABEL,
  WHY_VERIFY,
  ownerStatusCopy,
} from "@abonten/core/verification/copy";
import { isEditable } from "@abonten/core/verification/stateMachine";
import type {
  OrganizerType,
  VerificationEvidenceType,
  VerificationStatus,
  VerificationSubjectType,
} from "@abonten/types/verificationType";
import {
  AppText,
  Button,
  Field,
  Icon,
  Input,
  Refresher,
  Spinner,
  useToast,
} from "@abonten/ui-native";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

// The whole owner-facing verification flow on mobile — used by both the
// per-place screen and the organizer screen. Native throughout: a document
// picker and the camera roll rather than a file input, per-file rows with
// retry, toasts and haptics, not a web form squeezed onto a phone.

const STATUS_TONE: Record<VerificationStatus, "muted" | "brand" | "success" | "warning"> =
  {
    draft: "muted",
    pending_review: "muted",
    needs_info: "warning",
    approved: "success",
    rejected: "warning",
    withdrawn: "muted",
    revoked: "warning",
  };

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocRow({
  doc,
  onRemove,
  onRetry,
}: {
  doc: StagedDoc;
  onRemove: () => void;
  onRetry: () => void;
}) {
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
            ? "Sending…"
            : doc.status === "done"
              ? "Sent"
              : doc.status === "error"
                ? (doc.error ?? "Failed")
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
            Retry
          </AppText>
        </Pressable>
      ) : (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button">
          <Icon name="close" size={18} tone="muted" />
        </Pressable>
      )}
    </View>
  );
}

function StatusCard({
  status,
  subjectType,
  subjectName,
  reason,
}: {
  status: VerificationStatus;
  subjectType: VerificationSubjectType;
  subjectName: string | null;
  reason: string | null;
}) {
  const copy = ownerStatusCopy(status, subjectType, { subjectName, reason });
  const tone = STATUS_TONE[status];
  return (
    <View
      className={`gap-1 rounded-xl border p-4 ${
        tone === "success"
          ? "border-primary bg-primary/10"
          : tone === "warning"
            ? "border-border bg-card"
            : "border-border bg-card"
      }`}
    >
      <View className="flex-row items-center gap-2">
        <Icon
          name={
            status === "approved"
              ? "checkmark-circle"
              : status === "needs_info" || status === "revoked"
                ? "alert-circle-outline"
                : status === "rejected"
                  ? "close-circle-outline"
                  : "time-outline"
          }
          size={20}
          tone={tone === "success" ? "primary" : "muted"}
        />
        <AppText variant="sectionHeading">{copy.title}</AppText>
      </View>
      <AppText variant="small" tone="muted">
        {copy.body}
      </AppText>
    </View>
  );
}

export default function VerificationScreen({
  subjectType,
  subjectId,
}: {
  subjectType: VerificationSubjectType;
  subjectId: string;
}) {
  const toast = useToast();
  const q = useSubjectVerification(subjectType, subjectId);
  const view = verificationView(q.data);
  const actions = useVerificationActions(subjectType, subjectId);
  const staged = useStagedDocs();

  const [organizerType, setOrganizerType] = useState<OrganizerType | "">("");
  const [legalName, setLegalName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [evidenceType, setEvidenceType] = useState<string>("");

  if (q.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }

  if (!view) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <AppText tone="muted" className="text-center">
          Couldn&apos;t load verification.
        </AppText>
        <Button title="Try again" variant="outline" onPress={() => q.refetch()} />
      </View>
    );
  }

  const { approved, openCase, lastClosedCase, program, evidenceTypes } = view;
  const programOpen =
    subjectType === "place"
      ? program.placeRequestsEnabled
      : program.organizerRequestsEnabled;
  const currentType =
    evidenceType || evidenceTypes[0]?.key || "other";

  async function pickDocument() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    addStaged({
      uri: a.uri,
      name: a.name ?? "document",
      mimeType: guessMime(a.name ?? "", a.mimeType ?? "application/pdf"),
      sizeBytes: a.size ?? 0,
    });
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    addStaged({
      uri: a.uri,
      name: a.fileName ?? "photo.jpg",
      mimeType: guessMime(a.fileName ?? "", a.mimeType ?? "image/jpeg"),
      sizeBytes: a.fileSize ?? 0,
    });
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.error("Camera permission is needed to photograph a document.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    addStaged({
      uri: a.uri,
      name: a.fileName ?? "photo.jpg",
      mimeType: guessMime(a.fileName ?? "", a.mimeType ?? "image/jpeg"),
      sizeBytes: a.fileSize ?? 0,
    });
  }

  function addStaged(file: {
    uri: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    const attached =
      (openCase?.evidence.length ?? 0) +
      staged.docs.filter((d) => d.status !== "error").length;
    if (attached >= program.maxEvidenceFiles) {
      toast.error(
        `You can attach at most ${program.maxEvidenceFiles} documents.`,
      );
      return;
    }
    const invalid = validateDoc(file, program.maxFileBytes);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    staged.add({
      key: uuidv4(),
      uri: file.uri,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      isImage: file.mimeType.startsWith("image/"),
      evidenceType: currentType,
      status: "queued",
    });
  }

  async function sendOne(doc: StagedDoc, caseId: string) {
    staged.patch(doc.key, { status: "uploading", error: undefined });
    const err = await uploadVerificationDoc(caseId, doc);
    if (err) {
      staged.patch(doc.key, { status: "error", error: err });
      return false;
    }
    staged.patch(doc.key, { status: "done" });
    return true;
  }

  async function sendAll(caseId: string) {
    setBusy(true);
    let any = false;
    for (const doc of staged.docs) {
      if (doc.status === "done") continue;
      const ok = await sendOne(doc, caseId);
      any = any || ok;
    }
    setBusy(false);
    if (any) {
      staged.clearDone();
      await actions.invalidate();
      toast.success("Document added.");
    }
  }

  async function start() {
    if (subjectType === "organizer" && !organizerType) {
      toast.error("Choose the kind of organizer you are first.");
      return;
    }
    setBusy(true);
    const res = await actions.start.mutateAsync({
      organizerType: organizerType || null,
      legalName: legalName.trim() || null,
      applicantNote: note.trim() || null,
    });
    setBusy(false);
    if (res.status !== 200) {
      toast.error(res.message ?? "Could not start verification.");
    }
  }

  async function submit(caseId: string) {
    setBusy(true);
    await actions.update.mutateAsync({
      caseId,
      organizerType:
        subjectType === "organizer" ? organizerType || null : undefined,
      legalName: legalName.trim() || null,
      applicantNote: note.trim() || null,
    });
    const res = await actions.submit.mutateAsync(caseId);
    setBusy(false);
    if (res.status === 200) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success(res.message ?? "Sent for review.");
    } else {
      toast.error(res.message ?? "Could not send your request.");
    }
  }

  function confirmWithdraw(caseId: string) {
    Alert.alert(
      "Cancel this request?",
      "Your documents are removed and nothing is reviewed.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel request",
          style: "destructive",
          onPress: async () => {
            const res = await actions.withdraw.mutateAsync(caseId);
            if (res.status === 200) toast.success("Request withdrawn.");
            else toast.error(res.message ?? "Could not withdraw.");
          },
        },
      ],
    );
  }

  const body = () => {
    // Verified and nothing new in flight.
    if (approved && !openCase) {
      return (
        <>
          <StatusCard
            status="approved"
            subjectType={subjectType}
            subjectName={view.subjectName}
            reason={null}
          />
          <View className="gap-1 rounded-xl border border-border bg-card p-4">
            <AppText variant="sectionHeading">What your badge says</AppText>
            <AppText variant="small" tone="muted">
              Abonten reviewed documents supporting your business and your link
              to this account. It is not a statement about your service, prices
              or quality.
            </AppText>
          </View>
        </>
      );
    }

    if (openCase) {
      const editable = isEditable(openCase.status);
      const attached = openCase.evidence.length;
      return (
        <>
          <StatusCard
            status={openCase.status}
            subjectType={subjectType}
            subjectName={view.subjectName}
            reason={openCase.decisionReason}
          />

          {editable ? (
            <>
              {subjectType === "organizer" ? (
                <OrganizerTypePicker
                  value={organizerType || (openCase.organizerType ?? "")}
                  onChange={setOrganizerType}
                  allowed={program.organizerTypes}
                />
              ) : null}

              <View className="gap-3 rounded-xl border border-border bg-card p-4">
                <Field label="Registered name (optional)">
                  <Input
                    value={legalName}
                    onChangeText={setLegalName}
                    placeholder="As it appears on your documents"
                  />
                </Field>
                <Field label="Anything the reviewer should know (optional)">
                  <Input
                    value={note}
                    onChangeText={setNote}
                    multiline
                    numberOfLines={3}
                    placeholder="For example: the permit is in my father's name."
                  />
                </Field>
              </View>

              <EvidenceTypePicker
                types={evidenceTypes}
                value={currentType}
                onChange={setEvidenceType}
              />

              {openCase.evidence.length > 0 ? (
                <View className="gap-2">
                  {openCase.evidence.map((e) => (
                    <View
                      key={e.id}
                      className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-2.5"
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Icon
                          name="document-text-outline"
                          size={20}
                          tone="muted"
                        />
                      </View>
                      <View className="flex-1">
                        <AppText variant="small" className="font-medium">
                          {e.evidenceTypeLabel ?? e.evidenceType}
                        </AppText>
                        <AppText variant="caption" numberOfLines={1}>
                          {e.fileName ?? "Document"} · {humanSize(e.sizeBytes)}
                        </AppText>
                      </View>
                      <Pressable
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Remove document"
                        onPress={async () => {
                          const res = await actions.removeEvidence.mutateAsync({
                            caseId: openCase.id,
                            evidenceId: e.id,
                          });
                          if (res.status === 200) toast.success("Removed.");
                          else toast.error(res.message ?? "Could not remove.");
                        }}
                      >
                        <Icon name="trash-outline" size={18} tone="muted" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {staged.docs.length > 0 ? (
                <View className="gap-2">
                  {staged.docs.map((d) => (
                    <DocRow
                      key={d.key}
                      doc={d}
                      onRemove={() => staged.remove(d.key)}
                      onRetry={() => sendOne(d, openCase.id)}
                    />
                  ))}
                </View>
              ) : null}

              <View className="flex-row flex-wrap gap-2">
                <Button
                  title="Photograph"
                  variant="outline"
                  leftIcon="camera-outline"
                  onPress={takePhoto}
                  disabled={busy}
                />
                <Button
                  title="From gallery"
                  variant="outline"
                  leftIcon="image-outline"
                  onPress={pickPhoto}
                  disabled={busy}
                />
                <Button
                  title="PDF"
                  variant="outline"
                  leftIcon="document-outline"
                  onPress={pickDocument}
                  disabled={busy}
                />
              </View>

              {staged.docs.some((d) => d.status !== "done") ? (
                <Button
                  title={busy ? "Sending…" : "Add to request"}
                  onPress={() => sendAll(openCase.id)}
                  disabled={busy}
                />
              ) : null}

              <AppText variant="caption" tone="muted">
                Photos or PDF, up to{" "}
                {Math.round(program.maxFileBytes / (1024 * 1024))} MB each,{" "}
                {program.maxEvidenceFiles} in total.
              </AppText>

              <Button
                title={
                  openCase.status === "needs_info"
                    ? "Send again for review"
                    : "Send for review"
                }
                onPress={() => submit(openCase.id)}
                disabled={busy || attached === 0}
              />
              {attached === 0 ? (
                <AppText variant="caption" tone="muted">
                  Add at least one document before sending.
                </AppText>
              ) : null}
              <Button
                title="Cancel request"
                variant="outline"
                onPress={() => confirmWithdraw(openCase.id)}
                disabled={busy}
              />
            </>
          ) : (
            <>
              {openCase.evidence.length > 0 ? (
                <View className="gap-1 rounded-xl border border-border bg-card p-4">
                  <AppText variant="sectionHeading">What you sent</AppText>
                  {openCase.evidence.map((e) => (
                    <AppText key={e.id} variant="small" tone="muted">
                      {e.evidenceTypeLabel ?? e.evidenceType}
                      {e.fileName ? ` — ${e.fileName}` : ""}
                    </AppText>
                  ))}
                </View>
              ) : null}
              <Button
                title="Cancel request"
                variant="outline"
                onPress={() => confirmWithdraw(openCase.id)}
                disabled={busy}
              />
            </>
          )}
        </>
      );
    }

    // Nothing open.
    return (
      <>
        {lastClosedCase ? (
          <StatusCard
            status={lastClosedCase.status}
            subjectType={subjectType}
            subjectName={view.subjectName}
            reason={lastClosedCase.decisionReason}
          />
        ) : null}

        {!programOpen ? (
          <AppText variant="small" tone="muted">
            Verification isn&apos;t open yet. We&apos;ll let you know when you
            can apply.
          </AppText>
        ) : !view.canStart ? (
          <AppText variant="small" tone="muted">
            {view.blockedReason ?? "Verification isn't available right now."}
          </AppText>
        ) : (
          <>
            <View className="gap-2 rounded-xl border border-border bg-card p-4">
              <AppText variant="sectionHeading">Why verify</AppText>
              {WHY_VERIFY[subjectType].map((line) => (
                <View key={line} className="flex-row gap-2">
                  <Icon name="checkmark-circle" size={16} tone="primary" />
                  <AppText variant="small" tone="muted" className="flex-1">
                    {line}
                  </AppText>
                </View>
              ))}
            </View>

            <View className="gap-2 rounded-xl border border-border bg-card p-4">
              <AppText variant="sectionHeading">What you can send</AppText>
              <AppText variant="small" tone="muted">
                Send whatever you have. There is no single document Abonten
                insists on.
              </AppText>
              {evidenceTypes.map((t) => (
                <View key={t.key} className="gap-0.5">
                  <AppText variant="small" className="font-medium">
                    {t.label}
                  </AppText>
                  {t.description ? (
                    <AppText variant="caption" tone="muted">
                      {t.description}
                    </AppText>
                  ) : null}
                </View>
              ))}
            </View>

            <View className="gap-2 rounded-xl border border-border bg-muted p-4">
              <AppText variant="sectionHeading">How review works</AppText>
              {HOW_REVIEW_WORKS.map((line) => (
                <AppText key={line} variant="small" tone="muted">
                  {line}
                </AppText>
              ))}
            </View>

            {subjectType === "organizer" ? (
              <OrganizerTypePicker
                value={organizerType}
                onChange={setOrganizerType}
                allowed={program.organizerTypes}
              />
            ) : null}

            <Button
              title={lastClosedCase ? "Start a new request" : "Start verification"}
              onPress={start}
              disabled={busy}
            />
          </>
        )}
      </>
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-16"
      refreshControl={
        <Refresher refreshing={q.isRefetching} onRefresh={() => q.refetch()} />
      }
    >
      {body()}
    </ScrollView>
  );
}

function EvidenceTypePicker({
  types,
  value,
  onChange,
}: {
  types: VerificationEvidenceType[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (types.length === 0) return null;
  const selected = types.find((t) => t.key === value);
  return (
    <View className="gap-2">
      <AppText variant="sectionHeading">What are you sending?</AppText>
      <View className="flex-row flex-wrap gap-2">
        {types.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === t.key }}
            className={`rounded-full border px-3 py-1.5 ${
              value === t.key
                ? "border-primary bg-primary/10"
                : "border-border bg-card"
            }`}
          >
            <AppText variant="small" tone={value === t.key ? "brand" : "muted"}>
              {t.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      {selected?.description ? (
        <AppText variant="caption" tone="muted">
          {selected.description}
        </AppText>
      ) : null}
    </View>
  );
}

function OrganizerTypePicker({
  value,
  onChange,
  allowed,
}: {
  value: OrganizerType | "";
  onChange: (v: OrganizerType) => void;
  allowed: OrganizerType[];
}) {
  if (allowed.length === 0) return null;
  return (
    <View className="gap-2">
      <AppText variant="sectionHeading">What kind of organizer are you?</AppText>
      {allowed.map((t) => (
        <Pressable
          key={t}
          onPress={() => onChange(t)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === t }}
          className={`gap-1 rounded-xl border p-3 ${
            value === t ? "border-primary bg-primary/10" : "border-border bg-card"
          }`}
        >
          <AppText variant="small" className="font-medium">
            {ORGANIZER_TYPE_LABEL[t]}
          </AppText>
          <AppText variant="caption" tone="muted">
            {ORGANIZER_TYPE_DESCRIPTION[t]}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

/** Status pill reused by the places list and the organizer nav row. */
export function VerificationChip({ status }: { status: VerificationStatus }) {
  return (
    <View
      className={`rounded-full px-2 py-0.5 ${
        status === "approved" ? "bg-primary/15" : "bg-muted"
      }`}
    >
      <AppText
        variant="caption"
        tone={status === "approved" ? "brand" : "muted"}
      >
        {VERIFICATION_CHIP_LABEL[status]}
      </AppText>
    </View>
  );
}
