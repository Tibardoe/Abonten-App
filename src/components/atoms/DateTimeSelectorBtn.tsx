import React from "react";

type DateTimeProps = {
  dateType: string;
  currentType: string;
  title: string;
  text: string;
  onClick: (type: string) => void;
};

export default function DateTimeSelectorBtn({
  dateType,
  currentType,
  title,
  text,
  onClick,
}: DateTimeProps) {
  const isSelected = currentType === dateType;

  return (
    <button
      type="button"
      className={`p-3 border rounded-lg text-left transition-colors ${
        isSelected
          ? "border-primary bg-accent"
          : "border-border hover:border-input"
      }`}
      onClick={() => onClick(dateType)}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">{title}</span>
        <span
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            isSelected ? "border-primary bg-background" : "border-border"
          }`}
        >
          {isSelected && <span className="w-2 h-2 bg-primary rounded-full" />}
        </span>
      </div>
      <p className="text-xs md:text-sm text-muted-foreground mt-1">{text}</p>
    </button>
  );
}
