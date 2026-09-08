-- Repair messages that were persisted with message_type='file' but have no
-- attachment at all.
--
-- Cause: apps/mobile/.../Composer.tsx's send path read
--   anyAudio ? "audio" : anyImage ? "image" : "file"
-- with no "text" branch, so a plain typed message fell through to 'file'.
-- Fixed forward in the same change that adds this migration, but the rows
-- already written stayed wrong, and two shipped features are gated on
-- message_type = 'text':
--   * emoji-only large rendering (classifyEmojiOnly), and
--   * the Copy action in the message context menu,
-- while a reply preview of such a message rendered "Attachment" instead of
-- the text.
--
-- Scope is deliberately narrow and self-limiting: a row only qualifies if it
-- has ZERO rows in message_attachment, so a genuine file/image/audio message
-- can never be caught. Verified before applying against production:
--   rows matching the predicate ........ 11
--   'file' rows WITH an attachment ..... 0  (none at risk)
--   matching rows with NULL content .... 0  (none left contentless)
-- Idempotent: re-running matches nothing once the rows are 'text'.

update public.message m
   set message_type = 'text'
 where m.message_type = 'file'
   and not exists (
     select 1 from public.message_attachment a where a.message_id = m.id
   );
