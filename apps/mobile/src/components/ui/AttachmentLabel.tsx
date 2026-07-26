import { StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { theme, spacing, fontSize } from "../../theme";

export type AttachmentKind = "image" | "video" | "note";

export type AttachmentLabelProps = {
  readonly kind: AttachmentKind;
  /** File name for image/video, or the note text for a "note" kind. */
  readonly text: string;
  readonly color?: string;
  /** Fuller spoken description; falls back to the visible text. */
  readonly accessibilityLabel?: string;
};

/**
 * Shared attachment label: a real vector icon (image/video/note) followed by
 * the file name or note text. Replaces the emoji glyphs previously used
 * inline across task media, chat media, support evidence, and
 * completion-evidence lists — no emoji is used anywhere in the app.
 */
export function AttachmentLabel({
  kind,
  text,
  color = theme.textPrimary,
  accessibilityLabel,
}: AttachmentLabelProps) {
  const iconName = kind === "image" ? "image" : kind === "video" ? "video" : "note";
  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel ?? text}>
      <Icon name={iconName} size={16} color={theme.textSecondary} />
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  text: {
    fontSize: fontSize.sm,
    flexShrink: 1,
  },
});
