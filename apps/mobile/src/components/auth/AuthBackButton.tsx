import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { Icon } from "../ui/Icon";
import { theme, spacing, MIN_TOUCH_TARGET } from "../../theme";

/**
 * Top-left back control shared by the auth screens.
 *
 * The `(auth)` stack hides the native header, so each screen renders this to
 * stay navigable. It returns to the previous screen when one exists and
 * otherwise replaces to `fallback` — the latter covers deep-linked entries
 * (e.g. the password-recovery link) that have no in-app history to pop. Pass
 * `onPress` to override the default navigation (for example to cancel a
 * recovery session before leaving).
 */
export function AuthBackButton({
  fallback,
  onPress,
  accessibilityLabel = "Go back",
}: {
  readonly fallback: Href;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
}) {
  const insets = useSafeAreaInsets();

  function handlePress() {
    if (onPress) {
      onPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  }

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: Math.max(insets.top, spacing.xs),
        },
      ]}
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={12}
        style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
      >
        <View style={styles.icon}>
          <Icon name="arrow-right" size={24} color={theme.textPrimary} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.5,
  },
  icon: {
    transform: [{ rotate: "180deg" }],
  },
});
