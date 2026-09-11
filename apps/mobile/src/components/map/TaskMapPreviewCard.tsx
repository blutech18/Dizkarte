import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { PublicTaskFeedItem } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Icon } from "../ui/Icon";
import {
  theme,
  spacing,
  fontSize,
  radii,
} from "../../theme";

import { distanceLabel, taskTimingLabel } from "./taskMapPresentation";

export type TaskMapPreviewCardProps = {
  readonly task: PublicTaskFeedItem;
  readonly onOpen: (taskId: string) => void;
  readonly onClose: () => void;
};

export function TaskMapPreviewCard({ task, onOpen, onClose }: TaskMapPreviewCardProps) {
  const slideAnim = useRef(new Animated.Value(24)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    slideAnim.setValue(20);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
    ]).start();
  }, [task.id, slideAnim, opacityAnim]);

  const timing = taskTimingLabel(task);
  const distance = distanceLabel(task.distanceMeters);
  const locationText = distance ? `${task.landmark} · ${distance}` : task.landmark;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.cardWrapper,
          {
            transform: [{ translateY: slideAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.card,
            pressed ? styles.cardPressed : null,
          ]}
          onPress={() => onOpen(task.id)}
          accessibilityRole="button"
          accessibilityLabel={`${task.title}, click to view task description and details`}
          accessibilityHint="Navigates to the full task details screen"
        >
          {/* Top Status & Close Row */}
          <View style={styles.topRow}>
            <View style={styles.statusGroup}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Open for offers</Text>
              {timing ? (
                <>
                  <Text style={styles.separator}>·</Text>
                  <Text style={styles.timingText}>{timing}</Text>
                </>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.closeButtonPressed : null,
              ]}
              hitSlop={12}
              onPress={(e) => {
                e.stopPropagation?.();
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="Close task preview"
            >
              <Icon name="close" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>

          {/* Task Title */}
          <Text style={styles.title} numberOfLines={1}>
            {task.title}
          </Text>

          {/* Task Description */}
          {task.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {task.description}
            </Text>
          ) : null}

          {/* Location & Distance */}
          <View style={styles.locationRow}>
            <Icon name="map-pin" size={13} color={theme.textSecondary} />
            <Text style={styles.locationText} numberOfLines={1}>
              {locationText}
            </Text>
          </View>

          {/* Bottom Row: Budget & Action Button */}
          <View style={styles.bottomRow}>
            <View style={styles.budgetGroup}>
              <Text style={styles.budgetLabel}>BUDGET</Text>
              <Text style={styles.budgetAmount} numberOfLines={1}>
                {formatPhp(task.budgetCentavos)}
              </Text>
            </View>

            <View style={styles.actionButton}>
              <Text style={styles.actionButtonText}>View details</Text>
              <Icon name="arrow-right" size={12} color={theme.onPrimary} />
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    alignItems: "center",
    zIndex: 1200,
  },
  cardWrapper: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radii.lg,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.md,
    gap: spacing.xs + 2,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.995 }],
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  statusGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.primary,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.primary,
  },
  separator: {
    fontSize: fontSize.xs,
    color: theme.borderSubtle,
  },
  timingText: {
    fontSize: fontSize.xs,
    fontWeight: "500",
    color: theme.textSecondary,
    flexShrink: 1,
  },
  closeButton: {
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPressed: {
    opacity: 0.45,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.textSecondary,
    fontWeight: "400",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  locationText: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    fontWeight: "500",
    flex: 1,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  budgetGroup: {
    justifyContent: "flex-end",
  },
  budgetLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.textTertiary,
    letterSpacing: 0.6,
  },
  budgetAmount: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.primary,
    letterSpacing: -0.3,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.primary,
    borderRadius: radii.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  actionButtonText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.onPrimary,
  },
});
