import { File, Paths } from "expo-file-system";
import type { OutboxDraft } from "./useMessageOutbox";

// Failed sends, kept on disk per conversation so that leaving the screen
// (or the app being killed) doesn't silently throw a message away.
//
// The outbox itself stays in component state — this is only the durable
// copy of rows that reached the "failed" state. A row is written the moment
// a send fails, and removed the moment it is retried successfully, discarded
// by the user, or turns out to have landed after all (reconcile). Rows that
// are still "sending" are never persisted: the request is in flight and the
// server will either confirm it or the failure path will write it here.
//
// Stored under the app's document directory (survives restarts; not purged
// like the cache directory). Every failure here degrades to "nothing
// persisted" rather than surfacing to the user — losing the durable copy is
// exactly the previous behaviour, never worse.

export type PersistedFailedMessage = {
  clientGeneratedId: string;
  draft: OutboxDraft;
  createdAt: string;
};

const MAX_PER_CONVERSATION = 20;

function fileFor(conversationId: string): File {
  return new File(Paths.document, `outbox-${conversationId}.json`);
}

function sanitize(raw: unknown): PersistedFailedMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: PersistedFailedMessage[] = [];
  for (const item of raw) {
    const r = item as Partial<PersistedFailedMessage> | null;
    if (!r || typeof r.clientGeneratedId !== "string" || !r.draft) continue;
    out.push({
      clientGeneratedId: r.clientGeneratedId,
      draft: {
        content: typeof r.draft.content === "string" ? r.draft.content : null,
        replyToMessageId: r.draft.replyToMessageId ?? null,
        attachments: Array.isArray(r.draft.attachments)
          ? r.draft.attachments
          : [],
        localPreviewUris: Array.isArray(r.draft.localPreviewUris)
          ? r.draft.localPreviewUris.filter((u) => typeof u === "string")
          : [],
        messageType: r.draft.messageType ?? "text",
      },
      createdAt:
        typeof r.createdAt === "string"
          ? r.createdAt
          : new Date().toISOString(),
    });
    if (out.length >= MAX_PER_CONVERSATION) break;
  }
  return out;
}

export async function loadFailedMessages(
  conversationId: string,
): Promise<PersistedFailedMessage[]> {
  try {
    const file = fileFor(conversationId);
    if (!file.exists) return [];
    return sanitize(JSON.parse(await file.text()));
  } catch {
    return [];
  }
}

async function writeAll(
  conversationId: string,
  rows: PersistedFailedMessage[],
): Promise<void> {
  try {
    const file = fileFor(conversationId);
    if (rows.length === 0) {
      if (file.exists) file.delete();
      return;
    }
    file.write(JSON.stringify(rows.slice(0, MAX_PER_CONVERSATION)));
  } catch {
    // best effort
  }
}

export async function rememberFailedMessage(
  conversationId: string,
  row: PersistedFailedMessage,
): Promise<void> {
  const existing = await loadFailedMessages(conversationId);
  const rest = existing.filter(
    (r) => r.clientGeneratedId !== row.clientGeneratedId,
  );
  await writeAll(conversationId, [row, ...rest]);
}

export async function forgetFailedMessages(
  conversationId: string,
  clientGeneratedIds: Iterable<string>,
): Promise<void> {
  const drop = new Set(clientGeneratedIds);
  if (drop.size === 0) return;
  const existing = await loadFailedMessages(conversationId);
  const next = existing.filter((r) => !drop.has(r.clientGeneratedId));
  if (next.length === existing.length) return;
  await writeAll(conversationId, next);
}
