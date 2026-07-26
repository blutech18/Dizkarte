import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { theme, spacing, fontSize } from "../../theme";
import { Button } from "./Button";

export function LoadingState({ label = "Loading" }: { readonly label?: string }) {
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={`${label}…`}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={styles.caption}>{label}…</Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  readonly title: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}) {
  return (
    <View style={styles.container} accessibilityRole="text">
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.caption}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again.",
  onRetry,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly onRetry?: () => void;
}) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.caption}>{description}</Text>
      {onRetry ? <Button label="Retry" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

export function OfflineState({ onRetry }: { readonly onRetry?: () => void }) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>You are offline</Text>
      <Text style={styles.caption}>Check your internet connection and try again.</Text>
      {onRetry ? <Button label="Retry" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

export function DeniedState({
  title = "Not available",
  description,
}: {
  readonly title?: string;
  readonly description: string;
}) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.caption}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: theme.textPrimary,
    textAlign: "center",
  },
  caption: {
    fontSize: fontSize.md,
    color: theme.textSecondary,
    textAlign: "center",
  },
});
