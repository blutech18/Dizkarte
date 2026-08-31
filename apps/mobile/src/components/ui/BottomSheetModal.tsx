import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOTION_DURATION, MOTION_EASING } from "../../theme/motion";
import { MAX_CONTENT_WIDTH, theme, radii } from "../../theme";

export type BottomSheetModalProps = {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
};

/**
 * Shared bottom-sheet shell.
 *
 * The backdrop fades in on its own opacity track while the sheet slides up on
 * a separate translateY track, so the dimmed background never appears to
 * slide along with the card — a real bug in an earlier version of this
 * pattern. Every bottom sheet in the app (Rebook, Withdrawals, Filters)
 * renders through this one component instead of React Native's built-in
 * `animationType="slide"` (which animates backdrop and sheet as one rigid
 * unit and cannot be tuned), so opening and closing feels identical
 * everywhere and can only be tuned in one place (`theme/motion`).
 *
 * The shell owns device-level layout only: bottom safe-area padding, rounded
 * clipping, and a responsive tablet width cap. Individual sheets continue to
 * own their content padding so existing headers, lists, and footers are never
 * double-padded.
 *
 * Unmounting is deferred until the close animation finishes, so the sheet is
 * never yanked off-screen mid-transition.
 */
export function BottomSheetModal({ visible, onClose, children }: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const screenHeight = windowHeight || 800;
  const sheetOffset = screenHeight;
  const dismissThreshold = screenHeight * 0.60;

  const [rendered, setRendered] = useState(visible);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(sheetOffset)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: { endCoordinates?: { height: number }; duration?: number }) => {
      const height = e?.endCoordinates?.height ?? 0;
      const duration = e?.duration && e.duration > 0 ? e.duration : 250;
      setIsKeyboardVisible(true);
      Animated.timing(keyboardOffset, {
        toValue: height,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };

    const onHide = (e: { duration?: number }) => {
      const duration = e?.duration && e.duration > 0 ? e.duration : 200;
      setIsKeyboardVisible(false);
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        slide.stopAnimation();
        fade.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slide.setValue(gestureState.dy);
          const remaining = Math.max(0, 1 - gestureState.dy / screenHeight);
          fade.setValue(remaining);
        } else {
          // Subtle rubber-band resistance when dragging up past top
          slide.setValue(gestureState.dy * 0.12);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // Fast swipe down to bottom (flick) OR pulled down past 60% of screen height
        const isFastSwipeDown = gestureState.vy > 0.45 && gestureState.dy > 25;
        const reachedThreshold = gestureState.dy >= dismissThreshold;

        if (isFastSwipeDown || reachedThreshold) {
          Animated.parallel([
            Animated.timing(fade, {
              toValue: 0,
              duration: 250,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(slide, {
              toValue: sheetOffset,
              duration: 250,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]).start(({ finished }) => {
            if (finished) {
              setRendered(false);
              onClose();
            }
          });
        } else {
          // Smoothly snap back to top resting position
          Animated.parallel([
            Animated.spring(slide, {
              toValue: 0,
              bounciness: 2,
              speed: 12,
              useNativeDriver: false,
            }),
            Animated.timing(fade, {
              toValue: 1,
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(slide, {
            toValue: 0,
            bounciness: 2,
            speed: 12,
            useNativeDriver: false,
          }),
          Animated.timing(fade, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
        ]).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      fade.setValue(0);
      slide.setValue(sheetOffset);
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: MOTION_DURATION.open,
          easing: MOTION_EASING.open,
          useNativeDriver: false,
        }),
        Animated.timing(slide, {
          toValue: 0,
          duration: MOTION_DURATION.open,
          easing: MOTION_EASING.open,
          useNativeDriver: false,
        }),
      ]).start();
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 0,
          duration: MOTION_DURATION.close,
          easing: MOTION_EASING.close,
          useNativeDriver: false,
        }),
        Animated.timing(slide, {
          toValue: sheetOffset,
          duration: MOTION_DURATION.close,
          easing: MOTION_EASING.close,
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
    // `rendered` deliberately excluded: it is only read to skip the close
    // animation before the sheet has ever opened, not to re-trigger it.
  }, [visible, fade, slide, sheetOffset]);

  if (!rendered) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <Animated.View style={[styles.backdrop, { opacity: fade }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom > 0 ? Math.min(insets.bottom, 8) : 0,
              transform: [{ translateY: slide }],
              marginBottom: keyboardOffset,
              maxHeight: isKeyboardVisible
                ? Math.max(300, (windowHeight || 800) - 180)
                : "85%",
            },
          ]}
        >
          <View
            {...panResponder.panHandlers}
            accessibilityRole="button"
            accessibilityLabel="Collapse modal"
            accessibilityHint="Drag down or tap to collapse this sheet"
            style={styles.handleBar}
          >
            <View style={styles.handlePill} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    minWidth: 0,
    maxHeight: "85%",
    overflow: "hidden",
    backgroundColor: theme.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  handleBar: {
    width: "100%",
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  handlePill: {
    width: 44,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: theme.borderControl,
  },
});
