import { MediaViewer } from "@/components/MediaViewer";

// Thin single-image wrapper over the shared MediaViewer, kept as its own
// export so existing callers (ProfileHeader avatar, Edit Profile avatar,
// and anywhere a lone image should open in place) don't have to build the
// `items` array themselves. Full behaviour — pinch-zoom, drag-to-dismiss,
// safe areas, loading/error — comes from MediaViewer.
export function ImageViewer({
  uri,
  open,
  onClose,
}: {
  uri: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <MediaViewer
      items={uri ? [{ id: "image", uri }] : []}
      index={0}
      open={open && !!uri}
      onClose={onClose}
    />
  );
}
