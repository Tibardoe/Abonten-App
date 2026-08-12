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
    <div className="space-y-4 md:p-4 w-full mb-5">
      {!!imagePreview && (
        <>
          <div className="flex justify-between items-center px-5 text-white">
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

          <div className="relative flex flex-col items-center justify-center mx-auto w-full">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              minHeight={100}
              className="border rounded-md overflow-hidden max-w-full"
            >
              <img
                ref={imgRef}
                alt="Crop me"
                src={imagePreview}
                style={{ transform: `scale(${scale}) rotate(${rotate}deg)` }}
                // Bounding by max-height (rather than forcing w-full) lets large/tall
                // flyers shrink to fit the available modal space, WhatsApp-style,
                // instead of pushing crop controls off-screen.
                className="block max-h-[40dvh] sm:max-h-[45dvh] md:max-h-[55dvh] max-w-full w-auto h-auto mx-auto"
                onLoad={onImageLoad}
              />
            </ReactCrop>
          </div>

          {showControls && (
            <div className="mt-4 space-y-4 w-[95%] mx-auto">
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
