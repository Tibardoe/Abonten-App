import { useState } from "react";
import {
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
} from "react-native";
import { useThemeColors } from "../theme/ThemeProvider";
import { family } from "../theme/tokens";
import { AppText } from "./Typography";

// Native echo of apps/web/src/components/ui/input.tsx + the shadcn Form
// field wrapper (label / hint / error). `Field` is RHF-friendly: pass
// `error` from `formState.errors[name]?.message`.

export type InputProps = TextInputProps & {
  invalid?: boolean;
  className?: string;
};

export function Input({ invalid, className, style, ...rest }: InputProps) {
  const c = useThemeColors();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={c["muted-foreground"]}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      className={[
        "rounded-lg border bg-background px-3 py-3 text-[15px] text-foreground",
        invalid
          ? "border-destructive"
          : focused
            ? "border-ring"
            : "border-input",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={family.body ? [{ fontFamily: family.body }, style] : style}
      {...rest}
    />
  );
}

export type FieldProps = ViewProps & {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
};

export function Field({
  label,
  hint,
  error,
  className,
  children,
  ...rest
}: FieldProps) {
  return (
    <View
      className={["gap-1.5", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {label ? <AppText variant="label">{label}</AppText> : null}
      {children}
      {error ? (
        <AppText variant="small" tone="error">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption">{hint}</AppText>
      ) : null}
    </View>
  );
}
