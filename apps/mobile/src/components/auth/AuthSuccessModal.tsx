import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { CenterDialogModal } from "../ui/CenterDialogModal";
import { Icon } from "../ui/Icon";
import { theme, spacing, fontSize, lineHeight, radii } from "../../theme";

export type AuthSuccessModalProps = {
  readonly visible: boolean;
  readonly title: string;
  readonly message?: string;
  readonly onProceed: () => void;
  /** Auto proceed timeout in ms. Defaults to 1200ms. */
  readonly autoProceedTimeoutMs?: number;
};

/**
 * Minimalist centered confirmation HUD displayed after successful authentication
 * with a clean success state and loading indicator before seamlessly navigating.
 */
export function AuthSuccessModal({
  visible,
  title,
  message = "Redirecting to your dashboard...",
  onProceed,
  autoProceedTimeoutMs = 1200,
}: AuthSuccessModalProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      onProceed();
    }, autoProceedTimeoutMs);
    return () => clearTimeout(timer);
  }, [visible, autoProceedTimeoutMs, onProceed]);

  return (
    <CenterDialogModal visible={visible} onClose={onProceed} dismissible={false}>
      <View style={styles.hudCard}>
        <View style={styles.iconBadge}>
          <Icon name="check-circle" size={30} color={theme.successSolid} />
        </View>

        <Text style={styles.title} accessibilityRole="alert">
          {title}
        </Text>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      </View>
    </CenterDialogModal>
  );
}

const styles = StyleSheet.create({
  hudCard: {
    width: "82%",
    maxWidth: 270,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.successSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
    textAlign: "center",
    letterSpacing: -0.2,
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  loadingRow: {
    alignItems: "center",
    justifyContent: "center",
  },
});
