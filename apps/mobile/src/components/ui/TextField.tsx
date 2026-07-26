import { useId, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { theme, radii, spacing, fontSize, MIN_TOUCH_TARGET } from "../../theme";
import { Icon } from "./Icon";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  readonly label: string;
  readonly error?: string | undefined;
  readonly description?: string | undefined;
  readonly required?: boolean;
};

/**
 * Labeled text input with persistent visible label, optional description, and
 * validation error announced via `accessibilityLiveRegion`. Includes an interactive
 * eye icon button to toggle password visibility when `secureTextEntry` is enabled.
 */
export function TextField({ label, error, description, required, secureTextEntry, ...inputProps }: TextFieldProps) {
  const fieldId = useId();
  const isPasswordField = secureTextEntry !== undefined;
  const [isSecure, setIsSecure] = useState(Boolean(secureTextEntry));

  return (
    <View style={styles.container}>
      <Text style={styles.label} nativeID={`${fieldId}-label`}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}

      <View style={[styles.inputWrapper, error ? styles.inputError : null]}>
        <TextInput
          {...inputProps}
          secureTextEntry={isPasswordField ? isSecure : false}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${fieldId}-label`}
          accessibilityHint={description}
          style={styles.input}
          placeholderTextColor={theme.textSecondary}
        />
        {isPasswordField ? (
          <Pressable
            onPress={() => setIsSecure((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={isSecure ? "Show password" : "Hide password"}
            style={({ pressed }) => [styles.eyeButton, pressed ? styles.eyeButtonPressed : null]}
            hitSlop={8}
          >
            <Icon name={isSecure ? "eye" : "eye-off"} size={20} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  required: {
    color: theme.errorSolid,
  },
  description: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.sm,
    backgroundColor: theme.surface,
    paddingRight: spacing.xs,
  },
  inputError: {
    borderColor: theme.errorSolid,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    color: theme.textPrimary,
    fontSize: fontSize.md,
  },
  eyeButton: {
    minWidth: MIN_TOUCH_TARGET - 8,
    minHeight: MIN_TOUCH_TARGET - 8,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xs,
  },
  eyeButtonPressed: {
    opacity: 0.6,
  },
  error: {
    fontSize: fontSize.xs,
    color: theme.errorOnSoft,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
});
