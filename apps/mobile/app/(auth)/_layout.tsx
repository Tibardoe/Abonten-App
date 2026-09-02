import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // sign-in → verify reads as a step forward rather than a hard cut.
        animation: "slide_from_right",
      }}
    />
  );
}
