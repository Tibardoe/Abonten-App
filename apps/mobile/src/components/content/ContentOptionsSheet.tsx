import { useSession } from "@/auth/SessionProvider";
import { ReportSheet } from "@/components/ReportSheet";
import { contentShareUrl } from "@/features/content/contentLinks";
import { useInvalidateContent } from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { copyText } from "@/features/messaging/clipboardSupport";
import { api } from "@/lib/api";
import type { ContentPostDocument } from "@abonten/types/contentType";
import {
  Sheet,
  SheetOption,
  useModalHandoff,
  useToast,
} from "@abonten/ui-native";
import { useState } from "react";
import { Alert, Linking, View } from "react-native";

// The "…" sheet for a Spotlight or Story: copy link, download (when the
// author allowed it), not interested, report, delete for the author, plus
// surface-specific extras such as muting a publisher's Stories.
export function ContentOptionsSheet({
  post,
  open,
  onClose,
  onNotInterested,
  onDeleted,
  extra = [],
}: {
  post: ContentPostDocument;
  open: boolean;
  onClose: () => void;
  onNotInterested?: () => void;
  onDeleted?: () => void;
  extra?: { icon: "volume-mute-outline"; title: string; onPress: () => void }[];
}) {
  const { session } = useSession();
  const { program } = useContentProgram();
  const toast = useToast();
  const invalidate = useInvalidateContent();
  const handoff = useModalHandoff();
  const [reportOpen, setReportOpen] = useState(false);
  const noun = post.kind === "story" ? "Story" : "Spotlight";
  const isAuthor = post.viewer.isAuthor;
  const canDownload =
    post.kind === "spotlight" &&
    post.allowDownload &&
    program.spotlightDownloads &&
    !!session;

  const then = (fn: () => void) => {
    handoff.after(fn);
    onClose();
  };

  const confirmDelete = () =>
    Alert.alert(`Delete this ${noun}?`, "It disappears for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const res = await api.content.deletePost(post.id);
          if (res.status !== 200) {
            toast.error(res.message ?? `Couldn't delete this ${noun}.`);
            return;
          }
          toast.success(`${noun} deleted`);
          invalidate();
          onDeleted?.();
        },
      },
    ]);

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        onDismiss={handoff.onDismiss}
        title={noun}
      >
        <View className="gap-2 pb-2">
          <SheetOption
            icon="link-outline"
            title="Copy link"
            onPress={() =>
              then(async () => {
                const ok = await copyText(contentShareUrl(post.kind, post.id));
                if (ok) toast.success("Link copied");
                else toast.error("Couldn't copy the link");
              })
            }
          />
          {canDownload ? (
            <SheetOption
              icon="download-outline"
              title="Download"
              onPress={() =>
                then(async () => {
                  const res = await api.content.download(post.id);
                  if (res.status !== 200 || !res.data) {
                    toast.error(res.message ?? "This can't be downloaded.");
                    return;
                  }
                  await Linking.openURL(res.data.url);
                })
              }
            />
          ) : null}
          {extra.map((item) => (
            <SheetOption
              key={item.title}
              icon={item.icon}
              title={item.title}
              onPress={() => then(item.onPress)}
            />
          ))}
          {!isAuthor &&
          session &&
          post.kind === "spotlight" &&
          onNotInterested ? (
            <SheetOption
              icon="eye-off-outline"
              title="Not interested"
              subtitle="See fewer posts like this"
              onPress={() => then(onNotInterested)}
            />
          ) : null}
          {!isAuthor && session ? (
            <SheetOption
              icon="flag-outline"
              title={`Report ${noun}`}
              onPress={() => then(() => setReportOpen(true))}
            />
          ) : null}
          {isAuthor ? (
            <SheetOption
              icon="trash-outline"
              title={`Delete ${noun}`}
              onPress={() => then(confirmDelete)}
            />
          ) : null}
        </View>
      </Sheet>
      {reportOpen ? (
        <ReportSheet
          open
          onClose={() => setReportOpen(false)}
          targetType={post.kind}
          targetId={post.id}
          label={post.caption?.slice(0, 80) || noun}
        />
      ) : null}
    </>
  );
}
