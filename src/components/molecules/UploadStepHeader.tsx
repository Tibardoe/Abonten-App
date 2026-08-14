import MaskIcon from "@/components/atoms/MaskIcon";
import { cn } from "@/components/lib/utils";

type PrimaryAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type UploadStepHeaderProps = {
  onBack?: () => void;
  title?: string;
  primaryAction?: PrimaryAction;
  className?: string;
};

// Shared step header for upload flows (event flyer, avatar): a title-only
// bar for the first step, and a Back / Title / primary-action bar for the
// steps that follow. Used at every breakpoint — the desktop and mobile
// upload flows already rendered near-identical markup for this row.
export default function UploadStepHeader({
  onBack,
  title,
  primaryAction,
  className,
}: UploadStepHeaderProps) {
  if (!onBack && !primaryAction) {
    return (
      <div className={cn("w-full space-y-3", className)}>
        {title && (
          <h1 className="text-muted-foreground font-bold text-center pb-1 text-lg">
            {title}
          </h1>
        )}
        <hr className="border-border" />
      </div>
    );
  }

  return (
    <div className={cn("w-full space-y-3", className)}>
      <div className="flex justify-between items-center w-[90%] mx-auto">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back">
            <MaskIcon
              src="/assets/images/moveBack.svg"
              alt="Back"
              className="w-[30px] h-[30px]"
            />
          </button>
        ) : (
          <span className="w-[30px]" />
        )}

        {title && (
          <h1 className="text-muted-foreground font-bold text-center text-lg">
            {title}
          </h1>
        )}

        {primaryAction ? (
          <button
            type="button"
            className="font-bold"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </button>
        ) : (
          <span className="w-[30px]" />
        )}
      </div>

      <hr className="border-border" />
    </div>
  );
}
