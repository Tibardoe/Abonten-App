-- Optimised playback rendition for highlight videos.
--
-- Highlight videos were delivered as the raw uploaded clip: the stored
-- media_url carried no transformation at all (only `so_`/`eo_` trim offsets
-- when the editor had trimmed it), so every viewer streamed the source at its
-- full bitrate.
--
-- WHY A SEPARATE COLUMN RATHER THAN REWRITING media_url. Deriving a video is
-- not instant. Measured against this project's own Cloudinary account, a
-- synchronous derivation took 1.8 s for a 0.36 MB clip and 17.0 s for a
-- 4.8 MB one; the upload ceiling is 90 MB, so a synchronous derive in the
-- request path would blow any Server Action timeout. The derivation is
-- therefore kicked off asynchronously at upload time (eager_async) and its URL
-- stored here, while media_url keeps pointing at the original, which is always
-- immediately playable.
--
-- That gives the players a guaranteed-safe fallback: prefer playback_url, and
-- if it is not ready yet (Cloudinary answers 423 while a derivation is still
-- running) fall back to media_url, which is exactly today's behaviour. A
-- viewer can therefore never be shown a broken video because the optimised
-- asset is still being built.
--
-- NULL means "no optimised rendition" and is the correct steady state for two
-- cases: every image, and any video already within the playback profile --
-- re-encoding an already-small, already-low-bitrate phone clip measured as
-- saving almost nothing, and in one real case produced a 9.1% LARGER file.
-- See @abonten/core/videoDelivery for the decision rule and its tests.

alter table public.highlight
  add column if not exists playback_url text;

comment on column public.highlight.playback_url is
  'Optimised Cloudinary video rendition (720p-class, q_auto, 2 Mbps ceiling), '
  'generated eagerly at upload. NULL for images and for videos already within '
  'the playback profile. Players prefer this and fall back to media_url.';
