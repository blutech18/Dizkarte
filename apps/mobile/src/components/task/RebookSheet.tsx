import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { TEXT_LIMITS } from "@dizkarte/config";
import type { BookingRecord } from "../../services/marketplace/types";
import { useSession } from "../../providers/SessionProvider";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { BottomSheetModal } from "../ui/BottomSheetModal";
import { buildQuoteTaskParams, MIN_QUOTE_DESCRIPTION } from "./quoteTaskParams";
import {
  theme,
  spacing,
  fontSize,
  radii,
  lineHeight,
  MIN_TOUCH_TARGET,
  noWebOutline,
} from "../../theme";

export type RebookSheetProps = {
  readonly visible: boolean;
  /**
   * The past booking to rebook. Omitted when the sheet is opened from a Tasker's
   * public profile ("Request a quote"), where there is no prior task to reuse.
   */
  readonly booking?: BookingRecord;
  readonly taskerName: string;
  readonly onClose: () => void;
};

/**
 * "Book {tasker} again" / "Request a quote from {tasker}" bottom sheet.
 *
 * One sheet serves both entry points because they are the same act: the Client
 * writes a brief description and taps "Get a quote", which opens the normal
 * task-posting flow prefilled with that description (and, when rebooking, the
 * previous task's category).
 *
 * It is deliberately not a fabricated "quote sent" toast. The platform has no
 * private tasker-directed booking, so either path produces an ordinary public task
 * that this Tasker — and other nearby Taskers — can offer on. The hint text says
 * exactly that, because a Client who believes they hired someone privately would
 * be misled about who can see their task.
 *
 * Renders through the shared `BottomSheetModal` so its open/close motion matches
 * every other bottom sheet in the app.
 */
export function RebookSheet({ visible, booking, taskerName, onClose }: RebookSheetProps) {
  const { session } = useSession();
  const { repository } = useMarketplace();
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [prefilling, setPrefilling] = useState(false);

  const firstName = taskerName.trim().split(/\s+/)[0] || taskerName;
  const trimmed = description.trim();
  const canSubmit = trimmed.length >= MIN_QUOTE_DESCRIPTION;

  const useLastTaskDetails = useCallback(async () => {
    if (!session || !booking || prefilling) return;
    setPrefilling(true);
    try {
      const owned = await repository.getOwnedTask(booking.taskId, session.userId);
      const detail =
        owned?.draft.description?.trim() || owned?.draft.title?.trim() || booking.taskTitle;
      setDescription(detail.slice(0, TEXT_LIMITS.taskTitleMax));
      setCategoryId(owned?.draft.categoryId ?? null);
    } catch {
      setDescription(booking.taskTitle.slice(0, TEXT_LIMITS.taskTitleMax));
    } finally {
      setPrefilling(false);
    }
  }, [session, repository, booking, prefilling]);

  const getQuote = useCallback(() => {
    const params = buildQuoteTaskParams(description, categoryId);
    if (!params) return;
    onClose();
    router.push({ pathname: "/task/create", params });
  }, [description, categoryId, onClose]);

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <View style={styles.sheetContent}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.title}>
            {booking ? `Book ${firstName} again` : `Request a quote from ${firstName}`}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.closeBtn, pressed ? { opacity: 0.6 } : null]}
          >
            <Icon name="close" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text style={styles.subtitle}>Provide a brief description of the task</Text>

        <View style={styles.textareaWrapper}>
          <TextInput
            style={[styles.textarea, noWebOutline]}
            multiline
            placeholder="Describe the key details"
            placeholderTextColor={theme.textSecondary}
            value={description}
            onChangeText={setDescription}
            maxLength={TEXT_LIMITS.taskTitleMax}
            spellCheck={false}
            accessibilityLabel="Task description"
          />
        </View>
        <Text style={styles.counter}>
          {trimmed.length < MIN_QUOTE_DESCRIPTION
            ? `Minimum ${MIN_QUOTE_DESCRIPTION} characters`
            : `${trimmed.length} characters`}
        </Text>

        {/* Only a rebook has a previous task to copy from. */}
        {booking ? (
          <Pressable
            onPress={() => void useLastTaskDetails()}
            disabled={prefilling}
            accessibilityRole="button"
            accessibilityLabel={`Use details from last task with ${firstName}`}
            style={({ pressed }) => [styles.useLastRow, pressed ? { opacity: 0.7 } : null]}
          >
            <Icon name="note" size={16} color={theme.primary} />
            <Text style={styles.useLastText}>
              {prefilling ? "Loading last task…" : `Use details from last task with ${firstName}`}
            </Text>
          </Pressable>
        ) : null}

        <Button label="Get a quote" onPress={getQuote} disabled={!canSubmit} fullWidth />
        <Text style={styles.hint}>
          This posts a task with your details so {firstName} and other nearby Taskers can send you a
          quote.
        </Text>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 40 },
  title: { fontSize: fontSize.lg, fontWeight: "800", color: theme.textPrimary },
  closeBtn: {
    width: 40,
    height: MIN_TOUCH_TARGET,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  textareaWrapper: {
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textarea: {
    minHeight: 96,
    fontSize: fontSize.md,
    color: theme.textPrimary,
    textAlignVertical: "top",
  },
  counter: { fontSize: fontSize.xs, color: theme.textSecondary, textAlign: "right" },
  useLastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  useLastText: { fontSize: fontSize.sm, fontWeight: "600", color: theme.primary },
  hint: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
    marginTop: spacing.xs,
  },
});
