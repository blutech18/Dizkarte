import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { theme } from "../../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const FilterSelectionProgressContext = createContext<Animated.Value | null>(null);

type SelectionAccessibilityState = "selected" | "checked" | "none";

export type AnimatedFilterPressableProps = {
  readonly children: ReactNode;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly disabled?: boolean;
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string;
  readonly accessibilityState?: AccessibilityState;
  readonly selectionAccessibilityState?: SelectionAccessibilityState;
  readonly inactiveBackgroundColor?: string;
  readonly selectedBackgroundColor?: string;
  readonly inactiveBorderColor?: string;
  readonly selectedBorderColor?: string;
  readonly disabledBackgroundColor?: string;
  readonly disabledBorderColor?: string;
  readonly pressScale?: number;
};

export type AnimatedFilterTextProps = {
  readonly children: ReactNode;
  readonly style?: StyleProp<TextStyle>;
  readonly inactiveColor: string;
  readonly selectedColor: string;
  readonly disabled?: boolean;
  readonly disabledColor?: string;
  readonly numberOfLines?: number;
};

export type AnimatedFilterViewProps = {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly inactiveBackgroundColor: string;
  readonly selectedBackgroundColor: string;
  readonly disabled?: boolean;
  readonly disabledBackgroundColor?: string;
};

/** Respect the platform's reduced-motion preference for every filter surface. */
function useReducedMotionPreference(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

/**
 * Shared animated surface for filter chips, radio choices, and filter triggers.
 *
 * Layout remains entirely caller-owned, so flex-basis, wrapping, and touch-target
 * behavior stay responsive. Only color, border, opacity, and transform animate.
 */
export function AnimatedFilterPressable({
  children,
  selected,
  onPress,
  style,
  disabled = false,
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  selectionAccessibilityState = "selected",
  inactiveBackgroundColor = theme.surface,
  selectedBackgroundColor = theme.primary,
  inactiveBorderColor = theme.borderSubtle,
  selectedBorderColor = theme.primary,
  disabledBackgroundColor = theme.disabledBackground,
  disabledBorderColor = theme.borderSubtle,
  pressScale = 0.97,
}: AnimatedFilterPressableProps) {
  const reduceMotion = useReducedMotionPreference();
  const selectionProgress = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const pressProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    selectionProgress.stopAnimation();
    if (reduceMotion) {
      selectionProgress.setValue(selected ? 1 : 0);
      return;
    }
    Animated.timing(selectionProgress, {
      toValue: selected ? 1 : 0,
      duration: 190,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [reduceMotion, selected, selectionProgress]);

  const animatePress = (toValue: number, duration: number) => {
    pressProgress.stopAnimation();
    if (reduceMotion || disabled) {
      pressProgress.setValue(0);
      return;
    }
    Animated.timing(pressProgress, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const backgroundColor = disabled
    ? disabledBackgroundColor
    : selectionProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [inactiveBackgroundColor, selectedBackgroundColor],
      });
  const borderColor = disabled
    ? disabledBorderColor
    : selectionProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [inactiveBorderColor, selectedBorderColor],
      });
  const scale = pressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, pressScale],
  });
  const opacity = disabled
    ? 0.68
    : pressProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });

  const selectionState: AccessibilityState =
    selectionAccessibilityState === "checked"
      ? { checked: selected }
      : selectionAccessibilityState === "selected"
        ? { selected }
        : {};

  return (
    <FilterSelectionProgressContext.Provider value={selectionProgress}>
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => animatePress(1, 90)}
        onPressOut={() => animatePress(0, 150)}
        disabled={disabled}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ ...accessibilityState, ...selectionState, disabled }}
        style={[
          style,
          {
            backgroundColor,
            borderColor,
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        {children}
      </AnimatedPressable>
    </FilterSelectionProgressContext.Provider>
  );
}

/** Text whose color stays synchronized with its parent filter's selection transition. */
export function AnimatedFilterText({
  children,
  style,
  inactiveColor,
  selectedColor,
  disabled = false,
  disabledColor = theme.disabledForeground,
  numberOfLines,
}: AnimatedFilterTextProps) {
  const selectionProgress = useContext(FilterSelectionProgressContext);
  const color = disabled
    ? disabledColor
    : selectionProgress
      ? selectionProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [inactiveColor, selectedColor],
        })
      : inactiveColor;

  return (
    <Animated.Text style={[style, { color }]} numberOfLines={numberOfLines}>
      {children}
    </Animated.Text>
  );
}

/** Nested badge/container synchronized with its parent filter's selection transition. */
export function AnimatedFilterView({
  children,
  style,
  inactiveBackgroundColor,
  selectedBackgroundColor,
  disabled = false,
  disabledBackgroundColor = theme.disabledBackground,
}: AnimatedFilterViewProps) {
  const selectionProgress = useContext(FilterSelectionProgressContext);
  const backgroundColor = disabled
    ? disabledBackgroundColor
    : selectionProgress
      ? selectionProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [inactiveBackgroundColor, selectedBackgroundColor],
        })
      : inactiveBackgroundColor;

  return <Animated.View style={[style, { backgroundColor }]}>{children}</Animated.View>;
}
