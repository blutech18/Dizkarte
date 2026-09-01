import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * Smoothly lifts its content above the on-screen keyboard using animated timing
 * synchronized with native keyboard show/hide events.
 */
export function KeyboardAvoider({
  children,
  style,
  offset = 0,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly offset?: number;
}) {
  const keyboardPadding = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      const targetHeight = Math.max(0, e.endCoordinates.height - offset);
      const duration = Platform.OS === "ios" ? (e.duration || 250) : 200;
      Animated.timing(keyboardPadding, {
        toValue: targetHeight,
        duration,
        easing: Platform.OS === "ios" ? Easing.bezier(0.33, 1, 0.68, 1) : Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e: KeyboardEvent) => {
      const duration = Platform.OS === "ios" ? (e.duration || 250) : 200;
      Animated.timing(keyboardPadding, {
        toValue: 0,
        duration,
        easing: Platform.OS === "ios" ? Easing.bezier(0.33, 1, 0.68, 1) : Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardPadding, offset]);

  return (
    <Animated.View style={[style, { paddingBottom: keyboardPadding }]}>
      {children}
    </Animated.View>
  );
}
