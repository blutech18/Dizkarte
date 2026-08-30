import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  MIN_TOUCH_TARGET,
  useResponsiveLayout,
} from "../../theme";
import { Icon } from "./Icon";
import { useNotifications } from "../../providers/NotificationsProvider";

export type AppHeaderProps = {
  readonly title: string;
  /** Optional short line under the title (e.g. a count or context hint). */
  readonly subtitle?: string | undefined;
  /** Optional trailing slot, e.g. a text button ("Preferences", "Mark all read"). */
  readonly action?: ReactNode | undefined;
  /** Whether to display the inline top brand navbar. Defaults to false when Screen handles sticky header. */
  readonly showLogo?: boolean | undefined;
  /**
   * "page" (default): regular surface page header.
   * "hero": light title text for dark/purple containers.
   */
  readonly variant?: "page" | "hero" | undefined;
};

/**
 * Top brand header bar in brand purple with logo on left and bell/profile action buttons on right.
 * Pinned stickily at top of viewport so it follows on scrolling across all screens.
 *
 * Self-insets the top safe area with `useSafeAreaInsets()` so its purple
 * background extends all the way to the physical top of the screen, behind
 * the status bar, instead of stopping at the SafeAreaView's inset boundary.
 * Its call site `(tabs)/_layout.tsx` deliberately excludes `"top"` from the
 * SafeAreaView's `edges` so that view's own (non-purple) background never
 * shows through the status-bar strip above this bar — the two insets would
 * otherwise stack, double-padding the gap above the logo.
 */
export function BrandTopNavbar({ isHero = false }: { readonly isHero?: boolean | undefined }) {
  const { gutter } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  const unreadBadge = unreadCount > 99 ? "99+" : String(unreadCount);
  return (
    <View
      style={[
        styles.stickyHeaderOuter,
        { paddingTop: insets.top },
        isHero ? styles.stickyHeaderOuterHero : null,
      ]}
    >
      <View
        style={[
          styles.topNavbar,
          {
            paddingHorizontal: gutter,
          },
          isHero ? styles.topNavbarHero : null,
        ]}
      >
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset require is standard RN
          source={require("../../../assets/text-icon-white.png")}
          style={styles.brandLogo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessibilityLabel="Dizkarte"
        />
        <View style={styles.topNavbarActions}>
          <Pressable
            onPress={() => router.push("/(tabs)/notifications")}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
            }
            style={({ pressed }) => [
              styles.headerButton,
              pressed ? styles.headerButtonPressed : null,
            ]}
          >
            <View style={styles.iconBadgeAnchor}>
              <Icon name="bell" size={25} color={theme.onPrimary} />
              {unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {unreadBadge}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * Top brand navbar for sub-pages with a back arrow and single-line title.
 * Responsively matches BrandTopNavbar height, padding, and purple branding.
 *
 * Every call site is a plain `Stack` screen (via `Screen`'s `subPageTitle`
 * prop) with no ancestor `SafeAreaView`, so — like `BrandTopNavbar` — this bar
 * insets its own top edge with `useSafeAreaInsets()`. Without it the purple
 * background still fills edge-to-edge as intended, but the back arrow and
 * title were drawn at y=0 and sat directly under the transparent status bar,
 * colliding with the clock/system icons on Android.
 */
export function BrandSubPageNavbar({
  title,
  onBack,
}: {
  readonly title: string;
  readonly onBack?: (() => void) | undefined;
}) {
  const { gutter, isCompactPhone, isNarrowPhone } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const responsiveTitleSize = isNarrowPhone
    ? fontSize.md
    : isCompactPhone
      ? fontSize.lg - 1
      : fontSize.lg;

  return (
    <View style={[styles.stickyHeaderOuter, { paddingTop: insets.top }]}>
      <View
        style={[
          styles.topNavbar,
          {
            paddingHorizontal: gutter,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            if (onBack) {
              onBack();
            } else if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)/home");
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [
            styles.headerButton,
            pressed ? styles.headerButtonPressed : null,
          ]}
        >
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Icon name="arrow-right" size={22} color={theme.onPrimary} />
          </View>
        </Pressable>
        <Text
          style={[styles.subPageNavbarTitle, { fontSize: responsiveTitleSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          accessibilityRole="header"
        >
          {title}
        </Text>
        <View style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET }} />
      </View>
    </View>
  );
}

/**
 * Page Title & Subtitle header section.
 */
export function AppHeader({
  title,
  subtitle,
  action,
  showLogo = false,
  variant = "page",
}: AppHeaderProps) {
  const isHero = variant === "hero";
  const { isCompactPhone, isNarrowPhone } = useResponsiveLayout();
  const responsiveTitleSize = isNarrowPhone
    ? fontSize.xl
    : isCompactPhone
      ? fontSize.xxl - 4
      : fontSize.xxl;

  return (
    <View style={[styles.container, isHero ? styles.containerHero : null]}>
      {showLogo ? <BrandTopNavbar isHero={isHero} /> : null}
      <View style={styles.titleRow}>
        <View style={styles.titleGroup}>
          <View style={styles.titleWithActionRow}>
            <Text
              style={[
                styles.title,
                { fontSize: responsiveTitleSize },
                isHero ? styles.titleHero : null,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              accessibilityRole="header"
            >
              {title}
            </Text>
            {action ? <View style={styles.action}>{action}</View> : null}
          </View>
          {subtitle ? (
            <Text style={[styles.subtitle, isHero ? styles.subtitleHero : null]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stickyHeaderOuter: {
    backgroundColor: theme.primary,
    zIndex: 1000,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  stickyHeaderOuterHero: {
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    borderBottomWidth: 0,
  },
  container: {
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  containerHero: {
    marginBottom: spacing.lg,
  },
  topNavbar: {
    backgroundColor: theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  topNavbarHero: {
    backgroundColor: "transparent",
  },
  brandLogo: {
    width: 110,
    height: 32,
  },
  topNavbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  iconBadgeAnchor: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.errorSolid,
    borderWidth: 1.5,
    borderColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  badgeText: {
    color: theme.onPrimary,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    minWidth: 0,
  },
  titleGroup: {
    minWidth: 0,
    flex: 1,
  },
  titleWithActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: theme.textPrimary,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  titleHero: {
    color: theme.onPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
  },
  subtitleHero: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  action: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  subPageNavbarTitle: {
    minWidth: 0,
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: theme.onPrimary,
    flex: 1,
    textAlign: "left",
    marginLeft: spacing.xs,
  },
});
