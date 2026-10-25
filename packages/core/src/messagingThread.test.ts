import type { MessageRow } from "@abonten/types/messagingType";
import { describe, expect, it } from "vitest";
import { buildChatEntries, replyPreviewOf } from "./messagingThread";

const ME = "me";
const THEM = "them";

function row(over: Partial<MessageRow> & { id: string }): MessageRow {
  return {
    conversation_id: "c1",
    sender_id: THEM,
    message_type: "text",
    content: "hello",
    system_event: null,
    system_data: {},
    reply_to_message_id: null,
    client_generated_id: null,
    moderation_state: "visible",
    created_at: "2026-10-25T10:00:00.000Z",
    edited_at: null,
    deleted_at: null,
    attachments: [],
    reply_to: null,
    ...over,
  };
}

function messages(entries: ReturnType<typeof buildChatEntries>) {
  return entries.flatMap((e) => (e.kind === "msg" ? [e] : []));
}

describe("reply quotes in the thread", () => {
  const original = row({ id: "m1", content: "Are you coming tonight?" });

  it("shows the quote on a reply that is still sending", () => {
    const entries = buildChatEntries(
      [original],
      [
        {
          clientGeneratedId: "local-1",
          content: "Yes!",
          replyToMessageId: "m1",
          createdAt: "2026-10-25T10:01:00.000Z",
          hasAttachments: false,
        },
      ],
      ME,
    );
    const pending = messages(entries).find((e) => e.pending);
    expect(pending?.message.reply_to).toEqual({
      id: "m1",
      sender_id: THEM,
      message_type: "text",
      content: "Are you coming tonight?",
      deleted_at: null,
    });
  });

  it("fills the quote of a sent reply that arrived with only the id", () => {
    const sent = row({
      id: "m2",
      sender_id: ME,
      content: "Yes!",
      reply_to_message_id: "m1",
      created_at: "2026-10-25T10:01:00.000Z",
    });
    const entries = buildChatEntries([sent, original], [], ME);
    const reply = messages(entries).find((e) => e.message.id === "m2");
    expect(reply?.message.reply_to?.content).toBe("Are you coming tonight?");
  });

  it("keeps a quote the server already sent", () => {
    const fromServer = {
      id: "m1",
      sender_id: THEM,
      message_type: "text" as const,
      content: "server copy",
      deleted_at: null,
    };
    const sent = row({
      id: "m2",
      sender_id: ME,
      reply_to_message_id: "m1",
      reply_to: fromServer,
      created_at: "2026-10-25T10:01:00.000Z",
    });
    const entries = buildChatEntries([sent, original], [], ME);
    const reply = messages(entries).find((e) => e.message.id === "m2");
    expect(reply?.message.reply_to).toBe(fromServer);
  });

  it("has no quote when the answered message is not loaded", () => {
    const entries = buildChatEntries(
      [],
      [
        {
          clientGeneratedId: "local-1",
          content: "Yes!",
          replyToMessageId: "older",
          createdAt: "2026-10-25T10:01:00.000Z",
          hasAttachments: false,
        },
      ],
      ME,
    );
    expect(messages(entries)[0]?.message.reply_to).toBeNull();
  });

  it("quotes a deleted message without its text, a voice note by its attachment", () => {
    expect(
      replyPreviewOf(
        row({ id: "d", content: "gone", deleted_at: "2026-10-25T10:02:00Z" }),
      ),
    ).toMatchObject({ content: null, deleted_at: "2026-10-25T10:02:00Z" });

    const voice = row({
      id: "v",
      message_type: "audio",
      content: null,
      attachments: [
        {
          id: "a1",
          message_id: "v",
          storage_bucket: "message-attachments",
          storage_path: "c1/v.m4a",
          file_name: null,
          mime_type: "audio/mp4",
          file_size: 1000,
          width: null,
          height: null,
          duration_seconds: 18,
          created_at: "2026-10-25T10:00:00Z",
        },
      ],
    });
    expect(replyPreviewOf(voice)).toMatchObject({
      message_type: "audio",
      attachment_path: "c1/v.m4a",
      attachment_mime: "audio/mp4",
      duration_seconds: 18,
    });
  });
});
