import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type DimensionValue,
  type ViewStyle,
} from "react-native";
import { theme, radii, spacing } from "../../theme";

export type SkeletonProps = {
  readonly width?: DimensionValue | undefined;
  readonly height?: DimensionValue | undefined;
  readonly borderRadius?: number | undefined;
  readonly style?: ViewStyle | undefined;
};

/**
 * Base shimmering pulse skeleton component.
 * Animates smoothly between opacity 0.35 and 0.85 to indicate loading states.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = radii.sm,
  style,
}: SkeletonProps) {
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 750,
          easing: Easing.bezier(0.4, 0.0, 0.6, 1),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 750,
          easing: Easing.bezier(0.4, 0.0, 0.6, 1),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
}

export function SkeletonAvatar({
  size = 44,
  style,
}: {
  readonly size?: number | undefined;
  readonly style?: ViewStyle | undefined;
}) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} style={style} />;
}

export function SkeletonText({
  lines = 2,
  style,
}: {
  readonly lines?: number | undefined;
  readonly style?: ViewStyle | undefined;
}) {
  return (
    <View style={[styles.textGroup, style]}>
      {Array.from({ length: lines }).map((_, idx) => (
        <Skeleton
          key={idx}
          height={14}
          width={idx === lines - 1 && lines > 1 ? "60%" : "100%"}
          borderRadius={4}
        />
      ))}
    </View>
  );
}

export function SkeletonCard({ style }: { readonly style?: ViewStyle | undefined }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        <Skeleton width="65%" height={18} borderRadius={6} />
        <Skeleton width={70} height={22} borderRadius={radii.pill} />
      </View>
      <SkeletonText lines={2} />
      <View style={styles.cardFooter}>
        <Skeleton width={80} height={18} borderRadius={6} />
        <Skeleton width={110} height={14} borderRadius={4} />
      </View>
    </View>
  );
}

export function SkeletonList({
  count = 3,
  style,
}: {
  readonly count?: number | undefined;
  readonly style?: ViewStyle | undefined;
}) {
  return (
    <View style={[styles.list, style]}>
      {Array.from({ length: count }).map((_, idx) => (
        <SkeletonCard key={idx} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: theme.surfaceSubtle,
    borderColor: theme.borderSubtle,
    borderWidth: 1,
  },
  textGroup: {
    gap: spacing.xs + 2,
    width: "100%",
  },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md + 2,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  list: {
    gap: spacing.md,
    width: "100%",
  },
});
