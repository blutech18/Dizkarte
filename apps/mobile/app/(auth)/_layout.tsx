import { Stack } from "expo-router";
import { theme } from "../../src/theme";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        animationDuration: 250,
        gestureEnabled: true,
        contentStyle: { backgroundColor: theme.background },
      }}
    />
  );
}
