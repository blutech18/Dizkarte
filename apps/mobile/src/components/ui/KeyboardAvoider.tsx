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
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Smoothly lifts its content above the on-screen keyboard.
 *
 * Uses direct Keyboard event listeners rather than React Native's KeyboardAvoidingView,
 * ensuring reliable performance on iOS New Architecture (Fabric) where measureInWindow
 * can fail inside transformed parent views. On iOS, listens to `keyboardWillShow`/`keyboardWillHide`
 * to stay perfectly in sync with the native keyboard animation.
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
  const lift = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    const animateTo = (toValue: number, duration: number | undefined) => {
      Animated.timing(lift, {
        toValue,
        duration: duration && duration > 0 ? duration : 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };

    const onShow = (event: KeyboardEvent) => {
      const keyboardHeight = event.endCoordinates.height;
      const targetLift = Math.max(0, keyboardHeight - (insets.bottom || 0) + offset);
      animateTo(targetLift, event.duration);
    };

    const onHide = (event: KeyboardEvent) => {
      animateTo(0, event.duration);
    };

    const showSub = Keyboard.addListener("keyboardWillShow", onShow);
    const hideSub = Keyboard.addListener("keyboardWillHide", onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [lift, insets.bottom, offset]);

  return (
    <Animated.View style={[style, { paddingBottom: lift }]}>
      {children}
    </Animated.View>
  );
}
