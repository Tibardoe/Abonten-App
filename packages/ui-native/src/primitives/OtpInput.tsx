import { HUBTEL_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  type TextInput as RNTextInput,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from "react-native";
import { useThemeColors } from "../theme/ThemeProvider";
import { AppText } from "./Typography";

// Segmented one-time-code field: `length` cells rendered from a single
// controlled string, driven by one visually-hidden <TextInput> stretched
// across the whole row. One input (not one per cell) is what makes OS SMS
// autofill land in a single paste and keeps backspace behaviour sane.
//
// The hidden input carries the platform autofill hints
// (`textContentType="oneTimeCode"` on iOS, `autoComplete="sms-otp"` on
// Android). `onComplete` fires once the last cell fills.

export type OtpInputProps = {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
};

export function OtpInput({
  value,
  onChange,
  onComplete,
  // Hubtel issues 4-digit codes — keep the visible cell count in step with
  // the real code length (shared with web via @abonten/core/otpConstants).
  length = HUBTEL_OTP_CODE_LENGTH,
  disabled = false,
  invalid = false,
  autoFocus = true,
}: OtpInputProps) {
  const c = useThemeColors();
  const inputRef = useRef<RNTextInput>(null);
  const [focused, setFocused] = useState(false);
  const caret = useRef(new Animated.Value(1)).current;

  const digits = value.slice(0, length).split("");
  const activeIndex = Math.min(digits.length, length - 1);

  // Blink the caret in the active cell while focused.
  useEffect(() => {
    if (!focused || disabled) {
      caret.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, {
          toValue: 0,
          duration: 500,
          delay: 400,
          useNativeDriver: true,
        }),
        Animated.timing(caret, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [focused, disabled, caret]);

  function handleChange(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, length);
    if (next === value) return;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  }

  // Android sometimes doesn't emit onChangeText for a backspace on an empty
  // string; catching the key here keeps clearing predictable.
  function handleKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === "Backspace" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <View>
      <Pressable
        accessibilityRole="none"
        onPress={() => inputRef.current?.focus()}
        disabled={disabled}
        className="flex-row justify-center gap-2.5"
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        {Array.from({ length }).map((_, i) => {
          const char = digits[i];
          const isActive = focused && i === activeIndex && !char;
          const isFilledActive = focused && i === activeIndex && !!char;
          return (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length positional cells
              key={i}
              className={[
                "h-14 w-[46px] items-center justify-center rounded-xl border",
                invalid
                  ? "border-destructive"
                  : isActive || isFilledActive
                    ? "border-ring"
                    : char
                      ? "border-foreground/40"
                      : "border-input",
              ].join(" ")}
              style={{
                backgroundColor:
                  isActive || isFilledActive ? c.accent : c.background,
              }}
            >
              {char ? (
                <AppText className="text-[22px] font-semibold text-foreground">
                  {char}
                </AppText>
              ) : isActive ? (
                <Animated.View
                  style={{
                    opacity: caret,
                    width: 2,
                    height: 24,
                    borderRadius: 1,
                    backgroundColor: c.primary,
                  }}
                />
              ) : null}
            </View>
          );
        })}
      </Pressable>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onKeyPress={handleKeyPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        returnKeyType="done"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        importantForAutofill="yes"
        maxLength={length}
        caretHidden
        // Stretched invisibly across the whole row so a tap anywhere focuses
        // it and the OS autofill chip has a real target, without ever being
        // seen (the cells above are the visible UI).
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          opacity: 0.01,
        }}
      />
    </View>
  );
}
