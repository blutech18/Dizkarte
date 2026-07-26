import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme, spacing } from "../../theme";

export type ScreenProps = {
  readonly children: ReactNode;
  readonly scroll?: boolean;
  readonly padded?: boolean;
};

/** Consistent safe-area + background wrapper used by every screen. */
export function Screen({ children, scroll = true, padded = true }: ScreenProps) {
  const content = <View style={padded ? styles.padded : styles.unpadded}>{children}</View>;
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    flex: 1,
    padding: spacing.lg,
  },
  unpadded: {
    flex: 1,
  },
});
