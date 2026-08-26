import { Easing, Platform } from "react-native";

/**
 * Single source of truth for "opening/closing" motion — modals, bottom sheets,
 * and expand/collapse reveals (e.g. the chat "Add photo" panel, the My
 * Taskers services dropdown).
 *
 * Before this module existed, each surface hand-rolled its own
 * `Animated.timing` durations and easing curves (RebookSheet used one pair,
 * the My Taskers card another, and several modals used React Native's
 * built-in `animationType` — which cannot be tuned at all and, for
 * `"slide"`, animates the backdrop and sheet as one rigid unit instead of a
 * backdrop fade behind an independently sliding sheet). The result was a
 * different feel per screen. Every animated open/close in the app now reads
 * its timing from here, so "consistent from opening to closing" is
 * structural rather than a convention someone can forget to follow.
 */
export const MOTION_DURATION = {
  open: 240,
  close: 180,
} as const;

export const MOTION_EASING = {
  open: Easing.out(Easing.cubic),
  close: Easing.in(Easing.cubic),
} as const;

/** `Animated.timing` cannot run on the native driver on web; every animated value here respects that. */
export const MOTION_NATIVE_DRIVER = Platform.OS !== "web";
