import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
} from "react-native";
import { theme, radii, spacing, fontSize } from "../../theme";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "primaryDark" | "secondary" | "destructive" | "text";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  readonly label: string;
  readonly onPress: (event: GestureResponderEvent) => void;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
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
  size = "md",
  disabled = false,
  loading = false,
  accessibilityHint,
  fullWidth = false,
  icon,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const currentSize = sizeStyles[size] ?? sizeStyles.md;
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
        currentSize.container,
        variantStyles[variant].container,
        fullWidth ? styles.fullWidth : null,
        isDisabled ? styles.disabled : null,
        pressed && !isDisabled ? variantStyles[variant].pressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? theme.onPrimary : theme.primary}
          size={size === "sm" ? "small" : undefined}
        />
      ) : (
        <>
          {icon ? <Icon name={icon} size={currentSize.iconSize} color={labelColor} /> : null}
          <Text
            style={[
              styles.label,
              currentSize.label,
              variantStyles[variant].label,
              isDisabled ? styles.disabledLabel : null,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const sizeStyles = {
  sm: {
    container: {
      height: 34,
      minHeight: 34,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      gap: 5,
    },
    label: {
      fontSize: 13,
      lineHeight: 16,
      fontWeight: "700" as const,
    },
    iconSize: 13,
  },
  md: {
    container: {
      height: 42,
      minHeight: 42,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      gap: 6,
    },
    label: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "700" as const,
    },
    iconSize: 15,
  },
  lg: {
    container: {
      height: 48,
      minHeight: 48,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.md,
      gap: 8,
    },
    label: {
      fontSize: fontSize.md,
      fontWeight: "700" as const,
    },
    iconSize: 17,
  },
};

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  fullWidth: {
    width: "100%",
  },
  label: {
    textAlign: "center",
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
      pressed: { backgroundColor: theme.primaryPressed, transform: [{ scale: 0.98 }] },
    },
    // A deeper-purple pill, distinct from the surrounding brand-purple hero
    // background it sits on (e.g. the Home "Get offers" CTA), so the button
    // reads as a raised control instead of blending into its container.
    primaryDark: {
      container: { backgroundColor: theme.primaryPressed },
      label: { color: theme.onPrimary },
      pressed: { backgroundColor: theme.primaryHover, transform: [{ scale: 0.98 }] },
    },
    secondary: {
      container: {
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.borderControl,
      },
      label: { color: theme.primary },
      pressed: { backgroundColor: theme.surfaceSubtle, transform: [{ scale: 0.98 }] },
    },
    destructive: {
      container: { backgroundColor: theme.errorSolid },
      label: { color: "#FFFFFF" },
      pressed: { backgroundColor: theme.errorSolid, transform: [{ scale: 0.98 }] },
    },
    text: {
      container: { backgroundColor: "transparent" },
      label: { color: theme.link },
      pressed: { backgroundColor: theme.surfaceSubtle, transform: [{ scale: 0.98 }] },
    },
  };

