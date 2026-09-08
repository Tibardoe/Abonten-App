import { Sheet, SheetOption } from "@abonten/ui-native";
import { View } from "react-native";

// The action menu the `+` button opens (task §8) — a photo/video pick, a
// camera capture, or a document pick, instead of jumping straight into the
// gallery. Built on the shared bottom sheet so it matches every other menu
// in the app.

export function AttachmentSheet({
  open,
  onClose,
  onPickMedia,
  onCamera,
  onFile,
}: {
  open: boolean;
  onClose: () => void;
  onPickMedia: () => void;
  onCamera: () => void;
  onFile: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add to message">
      <View className="gap-2">
        <SheetOption
          icon="images-outline"
          title="Photos & Videos"
          onPress={() => {
            onClose();
            onPickMedia();
          }}
        />
        <SheetOption
          icon="camera-outline"
          title="Take Photo"
          onPress={() => {
            onClose();
            onCamera();
          }}
        />
        <SheetOption
          icon="document-outline"
          title="Choose File"
          onPress={() => {
            onClose();
            onFile();
          }}
        />
      </View>
    </Sheet>
  );
}
