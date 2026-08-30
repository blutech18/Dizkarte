import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, View, type StyleProp, type ViewStyle } from "react-native";

export type CollapsibleProps = {
  /** Controlled: the parent owns the open/closed boolean, this only animates the transition. */
  readonly expanded: boolean;
  readonly children: ReactNode;
  /**
   * Upper bound for the animated reveal height if layout measurement is not yet available.
   */
  readonly maxHeight?: number;
  readonly style?: StyleProp<ViewStyle>;
};

/**
 * Shared expand/collapse reveal with buttery smooth dynamic height measurement,
 * cubic-bezier easing, and fade interpolation.
 */
export function Collapsible({ expanded, children, maxHeight = 280, style }: CollapsibleProps) {
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: expanded ? 280 : 220,
      easing: expanded ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [expanded, progress]);

  const targetHeight = measuredHeight && measuredHeight > 0 ? measuredHeight : maxHeight;

  const animatedHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetHeight],
  });

  const animatedOpacity = progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.6, 1],
  });

  return (
    <Animated.View
      style={{ maxHeight: animatedHeight, opacity: animatedOpacity, overflow: "hidden" }}
    >
      <View
        style={style}
        onLayout={(e) => {
          const h = Math.ceil(e.nativeEvent.layout.height);
          if (h > 0 && h !== measuredHeight) {
            setMeasuredHeight(h);
          }
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
