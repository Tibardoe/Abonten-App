import {
  type HighlightMediaPick,
  useUploadHighlights,
} from "@/features/profile/useHighlights";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// App-level home for an in-flight highlight upload, so the compose screen
// can hand off a batch and close immediately while a compact progress
// banner keeps running on the profile (mirrors the web
// `HighlightUploadStatus`). One batch at a time — the "add" entry point is
// disabled while `isUploading`.

type Status = "idle" | "uploading" | "error" | "success";

type Ctx = {
  status: Status;
  progress: number; // 0..1
  count: number;
  error: string | null;
  /** Queue a batch and start uploading. */
  start: (userId: string, media: HighlightMediaPick[]) => void;
  retry: () => void;
  dismiss: () => void;
  isUploading: boolean;
};

const HighlightUploadContext = createContext<Ctx | undefined>(undefined);

export function HighlightUploadProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [userId, setUserId] = useState<string | undefined>();
  const [media, setMedia] = useState<HighlightMediaPick[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  // Identity of the batch the effect has already fired for.
  const firedFor = useRef<HighlightMediaPick[] | null>(null);

  const upload = useUploadHighlights(userId, { onProgress: setProgress });

  // Fire once per queued batch, after userId state has propagated so the
  // mutation is bound to the right invalidation key.
  useEffect(() => {
    if (!media || !userId) return;
    if (firedFor.current === media) return;
    firedFor.current = media;
    setStatus("uploading");
    setError(null);
    setProgress(0);
    upload.mutate(media, {
      onSuccess: () => {
        setStatus("success");
        setMedia(null);
        // Let the "done" tick show briefly, then clear.
        setTimeout(() => setStatus("idle"), 2200);
      },
      onError: (e) => {
        setStatus("error");
        setError(
          e instanceof Error ? e.message : "Upload failed. Please try again.",
        );
      },
    });
  }, [media, userId, upload.mutate]);

  const start = useCallback((uid: string, batch: HighlightMediaPick[]) => {
    firedFor.current = null;
    setUserId(uid);
    setMedia(batch);
    setStatus("uploading");
    setProgress(0);
    setError(null);
  }, []);

  const retry = useCallback(() => {
    if (!media) return;
    firedFor.current = null;
    setError(null);
    setStatus("uploading");
    // Re-assign a new array identity so the effect re-fires.
    setMedia([...media]);
  }, [media]);

  const dismiss = useCallback(() => {
    firedFor.current = null;
    setMedia(null);
    setError(null);
    setStatus("idle");
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      status,
      progress,
      count: media?.length ?? 0,
      error,
      start,
      retry,
      dismiss,
      isUploading: status === "uploading",
    }),
    [status, progress, media, error, start, retry, dismiss],
  );

  return (
    <HighlightUploadContext.Provider value={value}>
      {children}
    </HighlightUploadContext.Provider>
  );
}

export function useHighlightUpload(): Ctx {
  const ctx = useContext(HighlightUploadContext);
  if (!ctx) {
    throw new Error(
      "useHighlightUpload must be used within a HighlightUploadProvider",
    );
  }
  return ctx;
}
