import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type KeyboardEvent,
} from "react-native";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import type { TaskId } from "@dizkarte/domain";
import { Screen } from "../../../src/components/ui/Screen";
import { Button } from "../../../src/components/ui/Button";
import { Icon } from "../../../src/components/ui/Icon";
import { StatusBadge } from "../../../src/components/ui/StatusBadge";
import { LoadingState, ErrorState, DeniedState } from "../../../src/components/ui/AsyncState";
import {
  TaskDraftForm,
  draftFormFromInput,
  validateTaskDraftForm,
  type TaskDraftFormValue,
} from "../../../src/components/task/TaskDraftForm";
import { useSession } from "../../../src/providers/SessionProvider";
import { useMarketplace } from "../../../src/providers/MarketplaceProvider";
import { ScreenScrollProvider } from "../../../src/providers/ScreenScrollContext";
import {
  TaskMediaEditor,
  type PendingTaskMedia,
} from "../../../src/components/task/TaskMediaEditor";
import {
  removeTaskMediaObjects,
  uploadTaskMediaBatch,
} from "../../../src/services/storage/task-media-batch";
import type { TaskMediaAttachment } from "../../../src/services/marketplace/types";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  useResponsiveLayout,
} from "../../../src/theme";

type LoadState = "loading" | "loaded" | "denied" | "error";

/** Edit an existing owned task. Only reachable while the task is DRAFT or OPEN. */
export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const { gutter, isTablet } = useResponsiveLayout();
  const [state, setState] = useState<LoadState>("loading");
  const [form, setForm] = useState<TaskDraftFormValue | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<ReadonlyArray<PendingTaskMedia>>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const originalMediaRef = useRef<ReadonlyArray<TaskMediaAttachment>>([]);
  const cleanupQueueRef = useRef<ReadonlyArray<{ readonly storagePath: string }>>([]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const footerOpacity = useRef(new Animated.Value(1)).current;
  const footerTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      setKeyboardVisible(true);
      const duration = e?.duration && e.duration > 0 ? e.duration : 200;
      Animated.parallel([
        Animated.timing(footerOpacity, {
          toValue: 0,
          duration: Math.min(duration, 160),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(footerTranslateY, {
          toValue: 16,
          duration: Math.min(duration, 160),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    };

    const onHide = (e: KeyboardEvent) => {
      setKeyboardVisible(false);
      const duration = e?.duration && e.duration > 0 ? e.duration : 220;
      Animated.parallel([
        Animated.timing(footerOpacity, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(footerTranslateY, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [footerOpacity, footerTranslateY]);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getOwnedTask(id as TaskId, session.userId)
      .then((task) => {
        if (!task) {
          setState("denied");
          return;
        }
        if (task.status !== "DRAFT" && task.status !== "OPEN") {
          setState("denied");
          return;
        }
        setForm(draftFormFromInput(task.draft));
        setPendingMedia([]);
        setSaveError(null);
        originalMediaRef.current = task.draft.media;
        cleanupQueueRef.current = [];
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [id, repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFormChange = useCallback(
    (next: TaskDraftFormValue) => {
      setForm(next);
      setSaveError(null);
      if (Object.keys(errors).length > 0) {
        const validation = validateTaskDraftForm(next);
        setErrors(validation.ok ? {} : validation.errors);
      }
    },
    [errors],
  );

  const handleSave = useCallback(async () => {
    if (!session || !form) return;
    setSaveError(null);
    const result = validateTaskDraftForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
      return;
    }
    setErrors({});
    setSubmitting(true);
    let uploaded: ReadonlyArray<TaskMediaAttachment> = [];
    try {
      uploaded = await uploadTaskMediaBatch({
        userId: session.userId,
        taskId: id,
        files: pendingMedia,
      });
      const finalValidation = validateTaskDraftForm({
        ...form,
        media: [...form.media, ...uploaded],
      });
      if (!finalValidation.ok) {
        setErrors(finalValidation.errors);
        throw new Error(
          Object.values(finalValidation.errors)[0] ?? "Please review the task details and media.",
        );
      }
      const saved = await repository.saveDraftTask(
        session.userId,
        finalValidation.draft,
        id as TaskId,
      );

      const keptPaths = new Set(form.media.map((item) => item.storagePath));
      const removedOriginals = originalMediaRef.current.filter(
        (item) => !keptPaths.has(item.storagePath),
      );
      const cleanupByPath = new Map(
        [...cleanupQueueRef.current, ...removedOriginals].map((item) => [item.storagePath, item]),
      );
      const cleanup = await removeTaskMediaObjects([...cleanupByPath.values()]);

      notifyChanged();
      if (cleanup.failed.length > 0) {
        cleanupQueueRef.current = cleanup.failed;
        originalMediaRef.current = saved.draft.media;
        setForm(draftFormFromInput(saved.draft));
        setPendingMedia([]);
        setSaveError(
          "Your changes were saved, but some removed media could not be cleaned up. Tap Save & review to retry.",
        );
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        });
        return;
      }

      cleanupQueueRef.current = [];
      router.replace({ pathname: "/task/[id]/preview", params: { id: saved.id } });
    } catch (error) {
      let rollbackFailed = false;
      if (uploaded.length > 0) {
        const rollback = await removeTaskMediaObjects(uploaded);
        rollbackFailed = rollback.failed.length > 0;
      }
      setSaveError(
        rollbackFailed
          ? "The task was not saved, and some temporary uploads could not be cleaned up. Please try again."
          : error instanceof Error
            ? error.message
            : "Could not save your task. Check your connection and try again.",
      );
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, id, pendingMedia, repository, session, notifyChanged]);

  const handleCancel = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: "/task/[id]/preview", params: { id } });
  }, [id]);

  if (status === "loading") return <LoadingState label="Loading" />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (state === "loading") return <LoadingState label="Loading task" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (state === "denied" || !form) {
    return (
      <DeniedState
        title="Cannot edit this task"
        description="This task no longer belongs to you or is not editable in its current state."
      />
    );
  }

  const errorCount = Object.keys(errors).length;

  return (
    <Screen subPageTitle="Edit task" scroll={false} padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text accessibilityRole="text" style={{ display: "none" }}>
        Editing task {id}
      </Text>
      <View style={styles.page}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: gutter, paddingBottom: keyboardVisible ? 380 : 120 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={true}
          showsVerticalScrollIndicator={false}
        >
          <ScreenScrollProvider scrollViewRef={scrollRef}>
            <View style={styles.contentFrame}>
              <View style={styles.pageIntro}>
              <View style={styles.pageIntroText}>
                <Text
                  style={styles.pageTitle}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  accessibilityRole="header"
                >
                  Update task details
                </Text>
                <Text style={styles.pageSubtitle}>
                  Review your changes before returning to the publish screen.
                </Text>
              </View>
              <StatusBadge tone="neutral" label="Draft" />
            </View>

            {errorCount > 0 ? (
              <View
                style={styles.errorSummary}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <Icon name="alert-circle" size={20} color={theme.errorOnSoft} />
                <View style={styles.errorSummaryText}>
                  <Text style={styles.errorSummaryTitle}>Review the highlighted fields</Text>
                  <Text style={styles.errorSummaryBody}>
                    {errorCount} field{errorCount === 1 ? "" : "s"} need attention before you can
                    continue.
                  </Text>
                </View>
              </View>
            ) : null}

            {saveError ? (
              <View
                style={styles.errorSummary}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <Icon name="alert-circle" size={20} color={theme.errorOnSoft} />
                <View style={styles.errorSummaryText}>
                  <Text style={styles.errorSummaryTitle}>Could not finish saving</Text>
                  <Text style={styles.errorSummaryBody}>{saveError}</Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.formGrid, isTablet ? styles.formGridTablet : null]}>
              <View style={styles.formColumn}>
                <TaskDraftForm value={form} onChange={handleFormChange} errors={errors} />
              </View>

              <View style={[styles.mediaCard, isTablet ? styles.mediaCardTablet : null]}>
                <View style={styles.mediaHeader}>
                  <Icon name="image" size={20} color={theme.primary} />
                  <Text style={styles.mediaTitle}>Photos and video</Text>
                </View>
                <Text style={styles.mediaSubtitle}>
                  Clear media helps Taskers quote accurately.
                </Text>
                <View style={styles.mediaDivider} />
                <TaskMediaEditor
                  existing={form.media}
                  pending={pendingMedia}
                  onExistingChange={(next) => {
                    setForm({ ...form, media: next });
                    setSaveError(null);
                  }}
                  onPendingChange={(next) => {
                    setPendingMedia(next);
                    setSaveError(null);
                  }}
                  disabled={submitting}
                />
              </View>
            </View>
          </View>
        </ScreenScrollProvider>
      </ScrollView>

        <Animated.View
          pointerEvents={keyboardVisible ? "none" : "auto"}
          style={[
            styles.stickyOverlayFooter,
            {
              paddingVertical: spacing.md,
              opacity: footerOpacity,
              transform: [{ translateY: footerTranslateY }],
            },
          ]}
        >
          <View style={[styles.actionFooterInner, { paddingHorizontal: gutter }]}>
            <View style={styles.cancelAction}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={handleCancel}
                disabled={submitting}
                fullWidth
              />
            </View>
            <View style={styles.saveAction}>
              <Button
                label="Save & review"
                icon="check-circle"
                onPress={handleSave}
                loading={submitting}
                accessibilityHint="Saves the changes and returns to task review"
                fullWidth
              />
            </View>
          </View>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: spacing.lg },
  contentFrame: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    gap: spacing.lg,
  },
  pageIntro: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  pageIntroText: {
    flex: 1,
    gap: spacing.xs,
  },
  pageTitle: {
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  pageSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
  },
  errorSummary: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.errorSoft,
  },
  errorSummaryText: {
    flex: 1,
    gap: 2,
  },
  errorSummaryTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.errorOnSoft,
  },
  errorSummaryBody: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.errorOnSoft,
  },
  formGrid: {
    gap: spacing.md,
  },
  formGridTablet: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  formColumn: {
    flex: 1,
  },
  mediaCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  mediaCardTablet: {
    width: 280,
    flexShrink: 0,
  },
  mediaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mediaTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  mediaSubtitle: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  mediaDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
    marginVertical: spacing.md,
  },
  stickyOverlayFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  actionFooterInner: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cancelAction: {
    flex: 0.85,
  },
  saveAction: {
    flex: 1.15,
  },
});


