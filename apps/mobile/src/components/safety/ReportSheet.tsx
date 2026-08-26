import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheetModal } from "../ui/BottomSheetModal";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import { theme, spacing, fontSize, lineHeight, radii, MIN_TOUCH_TARGET } from "../../theme";

/** Mirrors the `reports.category` CHECK; labels are the user's words for them. */
const CATEGORIES = [
  { key: "harassment", label: "Harassment or abuse" },
  { key: "inappropriate", label: "Inappropriate content" },
  { key: "fraud", label: "Scam or fraud" },
  { key: "safety", label: "Safety concern" },
  { key: "spam", label: "Spam" },
  { key: "other", label: "Something else" },
] as const;

type Category = (typeof CATEGORIES)[number]["key"];

/** Contract bounds from `submit_report` (migration 0048). */
const MIN_NARRATIVE = 10;
const MAX_NARRATIVE = 4000;

export type ReportSheetProps = {
  readonly visible: boolean;
  readonly reporterId: string;
  readonly resourceType: "task" | "user" | "message" | "offer" | "booking";
  readonly resourceId: string;
  /** What the user is reporting, in their words — e.g. "this message". */
  readonly subjectLabel: string;
  readonly onClose: () => void;
};

/**
 * File a trust & safety report.
 *
 * The copy is deliberately plain about consequences: a report opens a review by
 * the Dizkarte team. It does not hide the content, block the other person, or
 * cancel a booking — none of which this product does today (blocking is pending an
 * approved policy). Promising otherwise in a safety flow would be the worst place
 * to be vague.
 *
 * Validation mirrors the server contract rather than guessing at it, so the
 * disabled Submit and the RPC agree on what "enough detail" means.
 */
export function ReportSheet({
  visible,
  reporterId,
  resourceType,
  resourceId,
  subjectLabel,
  onClose,
}: ReportSheetProps) {
  const { repository, notifyChanged } = useMarketplace();
  const [category, setCategory] = useState<Category | null>(null);
  const [narrative, setNarrative] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // A reopened sheet must never show the previous report's state.
  useEffect(() => {
    if (!visible) return;
    setCategory(null);
    setNarrative("");
    setSubmitting(false);
    setError(null);
    setDone(false);
  }, [visible]);

  const trimmed = narrative.trim();
  const canSubmit =
    category !== null &&
    trimmed.length >= MIN_NARRATIVE &&
    trimmed.length <= MAX_NARRATIVE &&
    !submitting;

  async function handleSubmit() {
    if (!category || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await repository.submitReport({
        reporterId,
        resourceType,
        resourceId,
        category,
        narrative: trimmed,
      });
      notifyChanged();
      setDone(true);
    } catch {
      setError("That report could not be sent. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <Text style={styles.heading} accessibilityRole="header">
        Report {subjectLabel}
      </Text>
      {done ? (
        <View style={styles.doneBlock} accessibilityRole="alert">
          <Icon name="shield" size={22} color={theme.successOnSoft} />
          <Text style={styles.doneTitle}>Report sent</Text>
          <Text style={styles.doneText}>
            Our team will review this and notify you once a decision is made. Nothing has been
            hidden or blocked — if you are unsafe or need the booking changed, contact support as
            well.
          </Text>
          <Button label="Done" onPress={onClose} />
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.introText}>
            Tell us what is wrong. A report opens a review by the Dizkarte team; it does not hide
            the content or block anyone.
          </Text>

          <Text style={styles.sectionLabel}>Reason</Text>
          <View style={styles.categoryGrid} accessibilityRole="radiogroup">
            {CATEGORIES.map((option) => {
              const selected = category === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setCategory(option.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={option.label}
                  style={({ pressed }) => [
                    styles.categoryChip,
                    selected ? styles.categoryChipSelected : null,
                    pressed ? styles.categoryChipPressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selected ? styles.categoryChipTextSelected : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>What happened?</Text>
          <TextInput
            value={narrative}
            onChangeText={setNarrative}
            multiline
            maxLength={MAX_NARRATIVE}
            placeholder="Describe what happened, with enough detail for someone reviewing it later."
            placeholderTextColor={theme.textSecondary}
            style={styles.input}
            accessibilityLabel="What happened"
            editable={!submitting}
          />
          <Text style={styles.counter}>
            {trimmed.length < MIN_NARRATIVE
              ? `At least ${MIN_NARRATIVE} characters (${trimmed.length}/${MIN_NARRATIVE})`
              : `${trimmed.length}/${MAX_NARRATIVE}`}
          </Text>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <Button
            label={submitting ? "Sending…" : "Send report"}
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
          />
        </View>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  body: {
    gap: spacing.sm,
  },
  introText: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
  },
  sectionLabel: {
    color: theme.textPrimary,
    fontSize: fontSize.xs,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  categoryChip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: theme.borderControl,
    backgroundColor: theme.surface,
  },
  categoryChipSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  categoryChipPressed: {
    opacity: 0.7,
  },
  categoryChipText: {
    color: theme.textPrimary,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  categoryChipTextSelected: {
    color: theme.primaryPressed,
    fontWeight: "800",
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    padding: spacing.sm,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    textAlignVertical: "top",
    backgroundColor: theme.surface,
  },
  counter: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    textAlign: "right",
  },
  error: {
    color: theme.errorOnSoft,
    fontSize: fontSize.xs,
  },
  doneBlock: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  doneTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  doneText: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    textAlign: "center",
  },
});
