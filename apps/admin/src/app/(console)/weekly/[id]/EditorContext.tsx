"use client";

import { useRouter } from "next/navigation";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";

// Shared state for one edition's editor: the version the page last loaded
// (every change sends it and gets the next one back), whether the person can
// edit or publish, and one place to show the result of the last action.
//
// A 409 means someone else saved first. The editor then reloads the page so
// the person sees their colleague's changes before trying again; nothing they
// did is applied on top of changes they have not seen.

type Result = {
  status: number;
  message?: string;
  data?: unknown;
};

type EditorState = {
  editionId: string;
  version: number;
  canEdit: boolean;
  canPublish: boolean;
  archived: boolean;
  pending: boolean;
  notice: { ok: boolean; text: string } | null;
  run: (
    action: (version: number) => Promise<Result>,
    options?: { success?: string; onSuccess?: (data: unknown) => void },
  ) => void;
  clearNotice: () => void;
};

const Ctx = createContext<EditorState | null>(null);

export function EditorProvider({
  editionId,
  version: loadedVersion,
  canEdit,
  canPublish,
  archived,
  children,
}: {
  editionId: string;
  version: number;
  canEdit: boolean;
  canPublish: boolean;
  archived: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [version, setVersion] = useState(loadedVersion);
  const [notice, setNotice] = useState<EditorState["notice"]>(null);

  // A refresh brings the server's current version.
  useEffect(() => {
    setVersion(loadedVersion);
  }, [loadedVersion]);

  const run = useCallback<EditorState["run"]>(
    (action, options) => {
      start(async () => {
        setNotice(null);
        const res = await action(version);
        const data = res.data as { version?: number } | undefined;
        if (res.status === 200) {
          if (typeof data?.version === "number") setVersion(data.version);
          setNotice({
            ok: true,
            text: options?.success ?? res.message ?? "Saved.",
          });
          options?.onSuccess?.(res.data);
          router.refresh();
          return;
        }
        if (typeof data?.version === "number") setVersion(data.version);
        setNotice({
          ok: false,
          text: res.message ?? "Something went wrong. Please try again.",
        });
        if (res.status === 409) router.refresh();
      });
    },
    [router, version],
  );

  return (
    <Ctx.Provider
      value={{
        editionId,
        version,
        canEdit: canEdit && !archived,
        canPublish,
        archived,
        pending,
        notice,
        run,
        clearNotice: () => setNotice(null),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useEditor(): EditorState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useEditor must be used inside EditorProvider");
  return value;
}

export const fieldClass =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-60";
