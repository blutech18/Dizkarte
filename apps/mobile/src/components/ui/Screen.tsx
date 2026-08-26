import type { ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { theme, spacing, useResponsiveLayout } from "../../theme";
import { BrandTopNavbar, BrandSubPageNavbar } from "./AppHeader";
import { KeyboardAvoider } from "./KeyboardAvoider";

export type ScreenProps = {
  readonly children: ReactNode;
  readonly scroll?: boolean | undefined;
  readonly padded?: boolean | undefined;
  readonly showHeader?: boolean | undefined;
  readonly subPageTitle?: string | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly headerVariant?: "page" | "hero" | undefined;
  readonly animateEntry?: boolean | undefined;
  /** Optional wider cap for workspace-style tablet/desktop screens. */
  readonly contentMaxWidth?: number | undefined;
  /**
   * Optional handle to the internal `ScrollView`, so a screen that reloads or
   * re-filters its own content (changing its height) can reset the scroll
   * position back to the top. Without this, a list that shrinks (e.g. a
   * filter or refresh drops it from many rows to one) can leave the
   * `ScrollView` at its previous offset — clamped to the new, shorter content
   * — which renders as blank space where the removed rows used to be, with
   * the remaining short content stuck near the bottom of the viewport.
   */
  readonly scrollViewRef?: RefObject<ScrollView | null> | undefined;
};

/**
 * Consistent safe-area + background wrapper used by every screen.
 * Padding and content width respond to window size.
 */
export function Screen({
  children,
  scroll = true,
  padded = true,
  showHeader = false,
  subPageTitle,
  onBack,
  headerVariant = "page",
  animateEntry = true,
  contentMaxWidth,
  scrollViewRef,
}: ScreenProps) {
  const { gutter, contentWidth, isTablet } = useResponsiveLayout();

  const fadeAnim = useRef(new Animated.Value(animateEntry ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(animateEntry ? 12 : 0)).current;

  useEffect(() => {
    if (!animateEntry) return;
    fadeAnim.setValue(0);
    slideAnim.setValue(12);

    const nativeDriver = Platform.OS !== "web";
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: nativeDriver,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: nativeDriver,
      }),
    ]).start();
  }, [animateEntry, fadeAnim, slideAnim]);

  const content = (
    <View
      style={[
        styles.contentBase,
        padded ? styles.contentPadded : null,
        // Inside the ScrollView the content must size to its CHILDREN so tall
        // content can scroll. Using `flex: 1` + `minHeight: 0` here lets the
        // wrapper shrink to the viewport and clip the overflow, which silently
        // kills scrolling on web (the profile page was the tallest example).
        // `flexGrow: 1` still fills the viewport when content is short, so
        // centered empty/loading states look right. The non-scroll branch keeps
        // `flex: 1` to fill the fixed area (screens that manage their own layout,
        // e.g. the map).
        scroll ? styles.contentScroll : styles.contentFill,
        { paddingHorizontal: padded ? gutter : 0 },
        isTablet
          ? contentMaxWidth
            ? { width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" }
            : { width: contentWidth, alignSelf: "center" }
          : null,
      ]}
    >
      {children}
    </View>
  );

  return (
    <Animated.View
      style={[
        styles.container,
        animateEntry
          ? {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }
          : null,
      ]}
    >
      {subPageTitle ? (
        <>
          {/*
            BrandSubPageNavbar is purple behind the status bar (it insets its
            own top edge), which needs light status bar icons for contrast —
            the app default ("dark", set in the root layout) is tuned for a
            light background. This local override applies only while this
            screen is mounted and reverts automatically once it unmounts.
          */}
          <StatusBar style="light" />
          <BrandSubPageNavbar title={subPageTitle} onBack={onBack} />
        </>
      ) : showHeader ? (
        <>
          <StatusBar style="light" />
          <BrandTopNavbar isHero={headerVariant === "hero"} />
        </>
      ) : null}
      <KeyboardAvoider style={styles.keyboardAvoider}>
        {scroll ? (
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoider>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: theme.background,
  },
  keyboardAvoider: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  // Browsers default flex children to min-height:auto. Without this explicit
  // zero minimum the RNW ScrollView measures to its full content height, then
  // the Expo Router card clips it instead of giving overflowY:auto a viewport.
  scrollView: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
  },
  contentBase: {
    minWidth: 0,
  },
  contentPadded: {
    paddingVertical: spacing.lg,
  },
  // Scroll screens: fill the viewport when short, size to content when tall so
  // the ScrollView actually scrolls (no `minHeight: 0`, which would clip).
  contentScroll: {
    flexGrow: 1,
  },
  // Non-scroll screens: fill the fixed area exactly.
  contentFill: {
    flex: 1,
    minHeight: 0,
  },
});
