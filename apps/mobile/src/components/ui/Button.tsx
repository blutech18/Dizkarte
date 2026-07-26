import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
} from "react-native";
import { theme, radii, spacing, fontSize, MIN_TOUCH_TARGET } from "../../theme";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "text";

export type ButtonProps = {
  readonly label: string;
  readonly onPress: (event: GestureResponderEvent) => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly accessibilityHint?: string;
  readonly fullWidth?: boolean;
  /** Optional leading real vector icon (never an emoji). */
  readonly icon?: IconName;
};

/**
 * Accessible pressable button. Always exposes `accessibilityRole="button"`
 * and a state-aware `accessibilityState`, and never renders as a bare
 * touchable `View` without a role/label (avoids inaccessible "div-buttons").
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityHint,
  fullWidth = false,
  icon,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const labelColor = isDisabled
    ? theme.disabledForeground
    : (variantStyles[variant].label as { color: string }).color;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant].container,
        fullWidth ? styles.fullWidth : null,
        isDisabled ? styles.disabled : null,
        pressed && !isDisabled ? variantStyles[variant].pressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? theme.onPrimary : theme.primary} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={17} color={labelColor} /> : null}
          <Text
            style={[
              styles.label,
              variantStyles[variant].label,
              isDisabled ? styles.disabledLabel : null,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    gap: spacing.sm,
  },
  fullWidth: {
    width: "100%",
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  disabled: {
    backgroundColor: theme.disabledBackground,
    borderColor: theme.disabledBackground,
  },
  disabledLabel: {
    color: theme.disabledForeground,
  },
});

const variantStyles: Record<ButtonVariant, { container: object; label: object; pressed: object }> =
  {
    primary: {
      container: { backgroundColor: theme.primary },
      label: { color: theme.onPrimary },
      pressed: { backgroundColor: theme.primaryPressed },
    },
    secondary: {
      container: {
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.borderControl,
      },
      label: { color: theme.primary },
      pressed: { backgroundColor: theme.surfaceSubtle },
    },
    destructive: {
      container: { backgroundColor: theme.errorSolid },
      label: { color: "#FFFFFF" },
      pressed: { backgroundColor: theme.errorSolid },
    },
    text: {
      container: { backgroundColor: "transparent" },
      label: { color: theme.link },
      pressed: { backgroundColor: theme.surfaceSubtle },
    },
  };
