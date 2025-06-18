import { canvasPreview } from "@/utils/canvasPreview";
import { useDebounceEffect } from "@/utils/useDebounceEffect";
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
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(16 / 9);
  const [showControls, setShowControls] = useState(true);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (aspect) {
      const { width, height } = e.currentTarget;
      setCrop(centerAspectCrop(width, height, aspect));
    }
  }

  async function handleCropSave() {
    const image = imgRef.current;
    const canvas = document.createElement("canvas");

    if (!image || !completedCrop?.width || !completedCrop?.height) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height,
    );

    canvas.toBlob((blob) => {
      if (!blob) return;
      const croppedFile = new File([blob], "cropped-image.png", {
        type: "image/png",
      });
      handleCropped(croppedFile);
    }, "image/png");
  }

  useDebounceEffect(
    async () => {
      if (
        completedCrop?.width &&
        completedCrop?.height &&
        imgRef.current &&
        previewCanvasRef.current
      ) {
        canvasPreview(
          imgRef.current,
          previewCanvasRef.current,
          completedCrop,
          scale,
          rotate,
        );
      }
    },
    100,
    [completedCrop, scale, rotate],
  );

  const aspectOptions = [
    { label: "Free", value: undefined },
    { label: "16:9", value: 16 / 9 },
    { label: "4:3", value: 4 / 3 },
    { label: "1:1", value: 1 },
    { label: "2:3", value: 2 / 3 },
  ];

  return (
    <div className="space-y-4 md:p-4 w-full md:overflow-y-scroll mb-5">
      {!!imagePreview && (
        <>
          <div className="flex justify-between items-center mb-2 ml-7">
            <button
              type="button"
              onClick={() => setShowControls(!showControls)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              {showControls ? "Hide Controls" : "Show Controls"}
            </button>
          </div>

          <div className="relative flex flex-col w-[75%] mx-auto">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              minHeight={100}
              className="border rounded-md overflow-hidden w-full md:w-[50%] self-center"
            >
              <img
                ref={imgRef}
                alt="Crop me"
                src={imagePreview}
                style={{ transform: `scale(${scale}) rotate(${rotate}deg)` }}
                onLoad={onImageLoad}
                className="max-h-[70vh] object-contain w-full"
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

          <div className="flex justify-end gap-3 pt-4 border-t mb-7 md:mb-0">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="min-w-[100px]"
            >
              Cancel
            </Button>
            <Button onClick={handleCropSave} className="min-w-[100px]">
              Save Changes
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
