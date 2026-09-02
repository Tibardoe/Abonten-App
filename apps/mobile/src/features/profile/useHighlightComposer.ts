import {
  MAX_HIGHLIGHT_IMAGE_BYTES,
  MAX_HIGHLIGHT_VIDEO_BYTES,
  MAX_HIGHLIGHT_VIDEO_SECONDS,
} from "@/features/profile/useHighlights";
import { uuidv4 } from "@/lib/uuid";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";

// Single source of truth for the highlight compose/edit flow's media
// selection — the native echo of the web `useMediaSelection` hook. Items
// carry everything the editor needs (intrinsic size, video duration, the
// trim window); all CRUD is id-based so a delete / reorder / trim can never
// desync from a stale array position.

export type EditableMedia = {
  id: string;
  uri: string;
  type: "image" | "video";
  width: number;
  height: number;
  /** seconds — videos only */
  durationSeconds: number | null;
  /** trim window start, seconds — videos only */
  startSeconds: number | null;
  /** trim window end, seconds — videos only */
  endSeconds: number | null;
};

const MB = 1024 * 1024;

export function useHighlightComposer() {
  const [items, setItems] = useState<EditableMedia[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeIndex = items.findIndex((m) => m.id === activeId);
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null;

  const pickFromLibrary = useCallback(async (): Promise<boolean> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to add highlights.",
      );
      return false;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 1,
      selectionLimit: 10,
    });
    if (picked.canceled || !picked.assets?.length) return false;

    const accepted: EditableMedia[] = [];
    const skipped: string[] = [];

    for (const asset of picked.assets) {
      const isVideo = asset.type === "video";
      const maxBytes = isVideo
        ? MAX_HIGHLIGHT_VIDEO_BYTES
        : MAX_HIGHLIGHT_IMAGE_BYTES;

      if (typeof asset.fileSize === "number" && asset.fileSize > maxBytes) {
        skipped.push(
          `One ${isVideo ? "video" : "image"} is over ${Math.round(
            maxBytes / MB,
          )}MB.`,
        );
        continue;
      }

      // expo-image-picker reports video duration in milliseconds.
      const durationSeconds =
        isVideo && typeof asset.duration === "number"
          ? asset.duration / 1000
          : null;

      accepted.push({
        id: uuidv4(),
        uri: asset.uri,
        type: isVideo ? "video" : "image",
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        durationSeconds,
        // Default the trim window to the first MAX seconds of a long clip,
        // otherwise the whole clip — same rule as the web hook.
        startSeconds: isVideo ? 0 : null,
        endSeconds: isVideo
          ? Math.min(
              durationSeconds ?? MAX_HIGHLIGHT_VIDEO_SECONDS,
              MAX_HIGHLIGHT_VIDEO_SECONDS,
            )
          : null,
      });
    }

    if (skipped.length > 0) {
      Alert.alert("Some items were skipped", [...new Set(skipped)].join("\n"));
    }
    if (accepted.length === 0) return false;

    setItems(accepted);
    setActiveId(accepted[0].id);
    return true;
  }, []);

  const select = useCallback((id: string) => setActiveId(id), []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx === -1) return prev;
      const next = prev.filter((m) => m.id !== id);
      setActiveId((cur) => {
        if (next.length === 0) return null;
        if (cur !== id) return cur;
        return next[Math.min(idx, next.length - 1)].id;
      });
      return next;
    });
  }, []);

  const reorder = useCallback((fromId: string, toId: string) => {
    setItems((prev) => {
      const from = prev.findIndex((m) => m.id === fromId);
      const to = prev.findIndex((m) => m.id === toId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const replaceCropped = useCallback(
    (id: string, uri: string, width: number, height: number) => {
      setItems((prev) =>
        prev.map((m) =>
          m.id === id && m.type === "image" ? { ...m, uri, width, height } : m,
        ),
      );
    },
    [],
  );

  const updateTrim = useCallback(
    (id: string, startSeconds: number, endSeconds: number) => {
      setItems((prev) =>
        prev.map((m) => (m.id === id ? { ...m, startSeconds, endSeconds } : m)),
      );
    },
    [],
  );

  const reset = useCallback(() => {
    setItems([]);
    setActiveId(null);
  }, []);

  return useMemo(
    () => ({
      items,
      activeId,
      activeItem,
      activeIndex,
      pickFromLibrary,
      select,
      remove,
      reorder,
      replaceCropped,
      updateTrim,
      reset,
    }),
    [
      items,
      activeId,
      activeItem,
      activeIndex,
      pickFromLibrary,
      select,
      remove,
      reorder,
      replaceCropped,
      updateTrim,
      reset,
    ],
  );
}
