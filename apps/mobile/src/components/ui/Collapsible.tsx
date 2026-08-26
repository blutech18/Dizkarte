import { useEffect, useRef, type ReactNode } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { MOTION_DURATION, MOTION_EASING } from "../../theme/motion";

export type CollapsibleProps = {
  /** Controlled: the parent owns the open/closed boolean, this only animates the transition. */
  readonly expanded: boolean;
  readonly children: ReactNode;
  /**
   * Upper bound for the animated reveal height.
   *
   * `Animated` cannot measure a native "auto" height, so every collapsible
   * region picks a generous estimate for its own content; anything taller is
   * clipped. Sized per call site (the My Taskers services list and the chat
   * attachments panel need different heights), never guessed globally.
   */
  readonly maxHeight?: number;
  readonly style?: StyleProp<ViewStyle>;
};

/**
 * Shared expand/collapse reveal — an animated height + fade instead of an
 * instant conditional render.
 *
 * Before this existed, some reveals (the My Taskers services dropdown) had
 * their own bespoke `Animated.timing` tuning, and others (the chat "Add
 * photo" attachments panel) had no transition at all — the panel just
 * appeared and disappeared instantly. Every collapsible region now shares one
 * timing/easing pair (`theme/motion`), so opening and closing feels the same
 * whether it is a dropdown, an attachment picker, or any future reveal.
 */
export function Collapsible({ expanded, children, maxHeight = 240, style }: CollapsibleProps) {
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: expanded ? MOTION_DURATION.open : MOTION_DURATION.close,
      easing: expanded ? MOTION_EASING.open : MOTION_EASING.close,
      // Height and opacity are layout/paint properties the native driver
      // cannot animate together with a JS-driven `maxHeight`.
      useNativeDriver: false,
    }).start();
  }, [expanded, progress]);

  const animatedMaxHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, maxHeight],
  });
  const animatedOpacity = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.3, 1],
  });

  return (
    <Animated.View
      style={[
        { maxHeight: animatedMaxHeight, opacity: animatedOpacity, overflow: "hidden" },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
