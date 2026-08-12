import { canvasPreview } from "@/utils/canvasPreview";
import type React from "react";
import { useRef, useState } from "react";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
  convertToPixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

type ImageCropType = {
  imagePreview: string;
  handleCropped: (croppedFile: File) => void;
  handleCancel: () => void;
};

export default function ImageCropper({
  imagePreview,
  handleCropped,
  handleCancel,
}: ImageCropType) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(1);
  const [showControls, setShowControls] = useState(true);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (aspect) {
      const { width, height } = e.currentTarget;
      setCrop(centerAspectCrop(width, height, aspect));
    }
  }

  async function handleCropSave() {
    const image = imgRef.current;

    if (!image || !completedCrop?.width || !completedCrop?.height) return;

    const canvas = document.createElement("canvas");

    // canvasPreview replays the same scale/rotate transform used for the
    // on-screen crop preview, so the uploaded file matches what the user saw
    // — drawing straight from the <img> here would silently ignore rotation
    // and zoom, since CSS transforms don't affect canvas pixel sampling.
    await canvasPreview(image, canvas, completedCrop, scale, rotate);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const croppedFile = new File([blob], "cropped-image.png", {
        type: "image/png",
      });
      handleCropped(croppedFile);
    }, "image/png");
  }

  const aspectOptions = [
    { label: "Free", value: undefined },
    { label: "16:9", value: 16 / 9 },
    { label: "4:3", value: 4 / 3 },
    { label: "1:1", value: 1 },
    { label: "2:3", value: 2 / 3 },
  ];

  return (
    // A bounded-height flex column, not an auto-growing block: the header and
    // controls are fixed-size (shrink-0) and the image area is the only
    // flexible piece (flex-1 min-h-0), so the image always gets exactly
    // "whatever's left" after the rest of the UI, on any screen — instead of
    // guessing a viewport percentage that may not leave room for controls.
    // Requires the parent to be a bounded-height flex column itself.
    <div className="flex flex-col flex-1 min-h-0 w-full md:p-4">
      {!!imagePreview && (
        <>
          <div className="flex justify-between items-center px-5 pb-3 text-white shrink-0">
            <Button onClick={handleCancel} className="bg-mint">
              Cancel
            </Button>

            <Button onClick={handleCropSave} className="bg-mint">
              Done
            </Button>

            {/* <div className="flex justify-between items-center mb-2 ml-7">
              <button
                type="button"
                onClick={() => setShowControls(!showControls)}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                {showControls ? "Hide Controls" : "Show Controls"}
              </button>
            </div> */}
          </div>

          <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              minHeight={100}
              className="border rounded-md overflow-hidden"
              // react-image-crop's own CSS cascades max-height down to the
              // <img> via `max-height: inherit` on its internal wrapper —
              // setting max-height directly on the <img> instead gets beaten
              // by that (more specific) rule and silently has no effect.
              // Setting it here, on the element the library actually reads,
              // lets it shrink the image to fit whatever height flexbox gave
              // this container above.
              style={{ maxHeight: "100%", maxWidth: "100%" }}
            >
              <img
                ref={imgRef}
                alt="Crop me"
                src={imagePreview}
                style={{ transform: `scale(${scale}) rotate(${rotate}deg)` }}
                onLoad={onImageLoad}
              />
            </ReactCrop>
          </div>

          {showControls && (
            <div className="pt-4 space-y-4 w-[95%] mx-auto shrink-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-sm font-medium text-gray-700 mb-1">
                    Zoom: {scale.toFixed(1)}x
                  </span>
                  <Slider
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={[scale]}
                    onValueChange={(value) => setScale(value[0])}
                    className="w-full"
                  />
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-700 mb-1">
                    Rotation: {rotate}°
                  </span>
                  <Slider
                    min={-180}
                    max={180}
                    step={1}
                    value={[rotate]}
                    onValueChange={(value) => setRotate(value[0])}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-medium text-gray-700">
                  Aspect Ratio
                </span>
                <div className="flex flex-wrap gap-2">
                  {aspectOptions.map((option) => (
                    <Button
                      key={option.label}
                      variant={aspect === option.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setAspect(option.value);
                        if (option.value && imgRef.current) {
                          const { width, height } = imgRef.current;
                          const newCrop = centerAspectCrop(
                            width,
                            height,
                            option.value,
                          );
                          setCrop(newCrop);
                          setCompletedCrop(
                            convertToPixelCrop(newCrop, width, height),
                          );
                        }
                      }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
