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
 * Smoothly lifts its content above the on-screen keyboard.
 *
 * Why not RN's `KeyboardAvoidingView`? On Android it animates the resize with
 * `LayoutAnimation`, which is a no-op under the New Architecture (Expo SDK 55+),
 * so the keyboard "jumps" the form instantly instead of gliding. Here the lift
 * is a bottom padding driven by `Animated.timing` — which runs fine on the New
 * Architecture — so the form eases in and out on both platforms. On iOS the
 * `keyboardWillShow`/`keyboardWillHide` events fire before the keyboard moves
 * and carry the system animation `duration`, so the glide stays perfectly in
 * sync with the keyboard; on Android we fall back to a short, gentle easing.
 */
export function KeyboardAvoider({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const animateTo = (toValue: number, duration: number | undefined) => {
      Animated.timing(lift, {
        toValue,
        duration: duration && duration > 0 ? duration : 240,
        easing: Easing.out(Easing.ease),
        // paddingBottom is a layout prop, so it cannot run on the native driver.
        useNativeDriver: false,
      }).start();
    };

    const onShow = (event: KeyboardEvent) => animateTo(event.endCoordinates.height, event.duration);
    const onHide = (event: KeyboardEvent) => animateTo(0, event.duration);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [lift]);

  return <Animated.View style={[style, { paddingBottom: lift }]}>{children}</Animated.View>;
}
