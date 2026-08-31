import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOTION_DURATION, MOTION_EASING, MOTION_NATIVE_DRIVER } from "../../theme/motion";
import { MAX_CONTENT_WIDTH, spacing } from "../../theme";

export type CenterDialogModalProps = {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Disable backdrop-tap-to-dismiss, e.g. while a submission is in flight. Defaults to dismissible. */
  readonly dismissible?: boolean;
  /** Whether to wrap in a native Modal. Set false when rendering inside an existing Modal or BottomSheet. */
  readonly useModal?: boolean;
};

/**
 * Shared center-dialog shell for confirmations and pickers (sign-out
 * confirmation, the date picker).
 *
 * The backdrop fades in on its own opacity track while the card fades and
 * scales up from 92% on a separate track — the same "independent backdrop,
 * independently animated content" structure as `BottomSheetModal`, just with
 * a scale-in instead of a slide-up, since a centered dialog has no natural
 * edge to slide from. Every center dialog renders through this one component
 * instead of React Native's built-in `animationType="fade"` (which cannot be
 * tuned and fades the backdrop and card at the same flat rate), so opening
 * and closing feels identical everywhere.
 *
 * This shell owns only device-level constraints: system-bar coverage, safe
 * insets, and a responsive width/height cap. Dialog cards continue to own
 * their visual padding and width within that safe frame.
 */
export function CenterDialogModal({
  visible,
  onClose,
  children,
  dismissible = true,
  useModal = true,
}: CenterDialogModalProps) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      fade.setValue(0);
      scale.setValue(0.92);
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: MOTION_DURATION.open,
          easing: MOTION_EASING.open,
          useNativeDriver: MOTION_NATIVE_DRIVER,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: MOTION_DURATION.open,
          easing: MOTION_EASING.open,
          useNativeDriver: MOTION_NATIVE_DRIVER,
        }),
      ]).start();
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 0,
          duration: MOTION_DURATION.close,
          easing: MOTION_EASING.close,
          useNativeDriver: MOTION_NATIVE_DRIVER,
        }),
        Animated.timing(scale, {
          toValue: 0.92,
          duration: MOTION_DURATION.close,
          easing: MOTION_EASING.close,
          useNativeDriver: MOTION_NATIVE_DRIVER,
        }),
      ]).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible, fade, scale]);

  if (!rendered) return null;

  const content = (
    <View
      style={[
        useModal ? null : StyleSheet.absoluteFill,
        styles.overlay,
        {
          zIndex: useModal ? undefined : 9999,
          elevation: useModal ? undefined : 20,
          paddingTop: Math.max(spacing.lg, insets.top),
          paddingRight: Math.max(spacing.lg, insets.right),
          paddingBottom: Math.max(spacing.lg, insets.bottom),
          paddingLeft: Math.max(spacing.lg, insets.left),
        },
      ]}
    >
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissible ? onClose : undefined}
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityState={{ disabled: !dismissible }}
        />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.cardWrapper,
          { opacity: fade, transform: [{ scale }], pointerEvents: "box-none" },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );

  if (!useModal) {
    return content;
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismissible ? onClose : undefined}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  cardWrapper: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    maxHeight: "100%",
    minWidth: 0,
    alignItems: "center",
  },
});
