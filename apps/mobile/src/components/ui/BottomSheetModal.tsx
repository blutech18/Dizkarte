import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOTION_DURATION, MOTION_EASING, MOTION_NATIVE_DRIVER } from "../../theme/motion";
import { MAX_CONTENT_WIDTH, theme, radii } from "../../theme";

/** How far below its resting position the sheet starts, so it slides up into view. */
const SHEET_OFFSET = 480;

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
  const [rendered, setRendered] = useState(visible);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(SHEET_OFFSET)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      fade.setValue(0);
      slide.setValue(SHEET_OFFSET);
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: MOTION_DURATION.open,
          easing: MOTION_EASING.open,
          useNativeDriver: MOTION_NATIVE_DRIVER,
        }),
        Animated.timing(slide, {
          toValue: 0,
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
        Animated.timing(slide, {
          toValue: SHEET_OFFSET,
          duration: MOTION_DURATION.close,
          easing: MOTION_EASING.close,
          useNativeDriver: MOTION_NATIVE_DRIVER,
        }),
      ]).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
    // `rendered` deliberately excluded: it is only read to skip the close
    // animation before the sheet has ever opened, not to re-trigger it.
  }, [visible, fade, slide]);

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
              paddingBottom: insets.bottom,
              transform: [{ translateY: slide }],
            },
          ]}
        >
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
});
