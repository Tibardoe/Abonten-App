import { useRef, useState } from "react";
import {
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
} from "react-native";
import { useThemeColors } from "../theme/ThemeProvider";
import { family } from "../theme/tokens";
import { useRevealInput } from "./KeyboardAwareScrollView";
import { AppText } from "./Typography";

// Native echo of apps/web/src/components/ui/input.tsx + the shadcn Form
// field wrapper (label / hint / error). `Field` is RHF-friendly: pass
// `error` from `formState.errors[name]?.message`.
//
// Inside a <KeyboardAwareScrollView> the input reports its focus — and,
// for a multiline field, its growth while focused — so the scroll view can
// keep the whole field above the keyboard. Outside one it is a no-op.

export type InputProps = TextInputProps & {
  invalid?: boolean;
  className?: string;
};

export function Input({ invalid, className, style, ...rest }: InputProps) {
  const c = useThemeColors();
  const [focused, setFocused] = useState(false);
  const ref = useRef<TextInput>(null);
  const reveal = useRevealInput();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c["muted-foreground"]}
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
      // After the spread so a caller's own handlers are chained, not lost.
      onFocus={(e) => {
        setFocused(true);
        reveal(ref.current);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      onContentSizeChange={(e) => {
        // A growing multiline field walks under the keyboard line by line
        // unless the scroll view follows it.
        if (rest.multiline && focused) reveal(ref.current);
        rest.onContentSizeChange?.(e);
      }}
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
