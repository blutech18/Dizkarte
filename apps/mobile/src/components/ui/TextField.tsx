import { useId, useRef, useState, type RefObject } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { theme, radii, spacing, fontSize, MIN_TOUCH_TARGET, noWebOutline } from "../../theme";
import { Icon } from "./Icon";
import { useScreenScroll } from "../../providers/ScreenScrollContext";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  readonly label?: string;
  readonly error?: string | undefined;
  readonly description?: string | undefined;
  readonly required?: boolean;
  readonly containerStyle?: StyleProp<ViewStyle>;
  readonly containerRef?: RefObject<View | null> | undefined;
};

/**
 * Labeled text input with persistent visible label, optional description, and
 * validation error announced via `accessibilityLiveRegion`. Includes an interactive
 * eye icon button to toggle password visibility when `secureTextEntry` is enabled.
 */
export function TextField({
  label,
  error,
  description,
  required,
  containerStyle,
  containerRef,
  secureTextEntry,
  multiline,
  textAlignVertical,
  ...inputProps
}: TextFieldProps) {
  const fieldId = useId();
  const screenScroll = useScreenScroll();
  const internalContainerRef = useRef<View>(null);
  const isPasswordField = secureTextEntry !== undefined;
  const isEditable = inputProps.editable !== false;
  const [isSecure, setIsSecure] = useState(Boolean(secureTextEntry));
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View
      ref={(node) => {
        (internalContainerRef as React.MutableRefObject<View | null>).current = node;
        if (containerRef && "current" in containerRef) {
          (containerRef as React.MutableRefObject<View | null>).current = node;
        }
      }}
      style={[styles.container, containerStyle]}
    >
      {label ? (
        <Text style={styles.label} nativeID={`${fieldId}-label`}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}

      <View
        style={[
          styles.inputWrapper,
          !isEditable ? styles.inputWrapperDisabled : null,
          multiline ? styles.inputWrapperMultiline : null,
          isFocused ? styles.inputWrapperFocused : null,
          error ? styles.inputError : null,
        ]}
      >
        <TextInput
          spellCheck={false}
          {...inputProps}
          editable={isEditable}
          onFocus={(e) => {
            if (!isEditable) return;
            setIsFocused(true);
            screenScroll?.scrollToRef(internalContainerRef);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            inputProps.onBlur?.(e);
          }}
          secureTextEntry={isPasswordField ? isSecure : false}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : textAlignVertical}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          accessibilityLabelledBy={label ? `${fieldId}-label` : undefined}
          accessibilityHint={description}
          style={[
            styles.input,
            !isEditable ? styles.inputDisabled : null,
            multiline ? styles.inputMultiline : null,
            noWebOutline,
          ]}
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
    height: 48,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
    paddingRight: spacing.xs,
  },
  inputWrapperDisabled: {
    backgroundColor: theme.surfaceSubtle,
    borderColor: theme.borderSubtle,
  },
  inputWrapperFocused: {
    borderColor: theme.primary,
  },
  inputWrapperMultiline: {
    minHeight: 136,
    height: "auto",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
  },
  inputError: {
    borderColor: theme.errorSolid,
  },
  input: {
    flex: 1,
    height: 48,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    color: theme.textPrimary,
    fontSize: fontSize.md,
  },
  inputDisabled: {
    color: theme.textSecondary,
  },
  inputMultiline: {
    minHeight: 116,
    lineHeight: 22,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
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
