import { useEffect, useRef, useState } from "react";
import { Redirect, Tabs, usePathname } from "expo-router";
import type { BottomTabBarButtonProps } from "expo-router/js-tabs";
import { PlatformPressable } from "expo-router/build/react-navigation/elements";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useSession } from "../../src/providers/SessionProvider";
import { theme } from "../../src/theme";
import { LoadingState } from "../../src/components/ui/AsyncState";
import { Icon, type IconName } from "../../src/components/ui/Icon";
import { BrandTopNavbar } from "../../src/components/ui/AppHeader";

const TAB_ICON_LIFT_DURATION_MS = 70;
const TAB_ICON_SETTLE_DURATION_MS = 100;
const USE_NATIVE_DRIVER = Platform.OS !== "web";

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
 * Capability-aware main navigation.
 * Stationed top brand navbar sits above <Tabs> so the header remains completely
 * fixed and stationary while the tab content switches underneath.
 */
export default function TabsLayout() {
  const { session, status } = useSession();
  const pathname = usePathname();
  const reduceMotion = useReducedMotionPreference();
  const insets = useSafeAreaInsets();

  if (status === "loading") {
    return <LoadingState />;
  }
  if (status === "signed-out" || !session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  const isHome = pathname === "/home" || pathname === "/";
  const activeTab = isHome ? "home" : pathname.split("/")[1];

  // Reserve home indicator clearance without stretching the tab bar disproportionately.
  // On iOS devices with home indicators (e.g. iPhone 12-16), insets.bottom is 34px.
  // Reserving 18px-20px is standard and avoids the excessive white space.
  const bottomInset = Platform.OS === "web" ? 0 : Math.max(0, Math.min(insets.bottom, 20));
  const tabHeight = 52 + bottomInset;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      {/*
        The header bar (below) is purple all the way behind the status bar
        on every tab, which needs light (white) status bar icons for
        contrast — the app default set in the root layout is "dark", tuned
        for the light background regular screens use. This local StatusBar
        overrides that default for as long as any tab screen is mounted, and
        automatically reverts to "dark" once the user navigates away from
        the tabs (expo-status-bar merges nested instances in mount order).
      */}
      <StatusBar style="light" />
      {/* Stationed, fixed top header bar — never moves during tab transitions.
          "top" is deliberately excluded from this SafeAreaView's edges:
          BrandTopNavbar insets its own top edge (so its purple background
          extends behind the status bar). If this SafeAreaView also reserved
          the top inset, the padding would stack, AND the gap it reserves
          renders in this View's own `theme.background` (light) colour, not
          purple — showing a light-coloured strip above the header instead of
          a seamless purple sweep behind the status bar. */}
      <BrandTopNavbar isHero={isHome} />
      <View style={styles.tabContent}>
        <Tabs
          screenOptions={{
            headerShown: false,
            animation: "none",
            tabBarActiveTintColor: theme.primary,
            tabBarInactiveTintColor: theme.textSecondary,
            tabBarActiveBackgroundColor: "transparent",
            tabBarInactiveBackgroundColor: "transparent",
            tabBarButton: (props) => <PlainTabBarButton {...props} />,
            tabBarStyle: {
              backgroundColor: theme.surface,
              borderTopColor: theme.borderSubtle,
              borderTopWidth: 1,
              height: tabHeight,
              paddingTop: 4,
              paddingBottom: bottomInset > 0 ? bottomInset : 4,
              elevation: 4,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
            },
            tabBarItemStyle: {
              paddingVertical: 0,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: "600",
              marginTop: 1,
              marginBottom: 0,
            },
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: "Home",
              tabBarIcon: () => (
                <TabIcon name="home" selected={activeTab === "home"} reduceMotion={reduceMotion} />
              ),
            }}
          />
          <Tabs.Screen
            name="browse"
            options={{
              title: "Browse",
              tabBarIcon: () => (
                <TabIcon
                  name="search"
                  selected={activeTab === "browse"}
                  reduceMotion={reduceMotion}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="my-tasks"
            options={{
              title: "My Tasks",
              tabBarIcon: () => (
                <TabIcon
                  name="briefcase"
                  selected={activeTab === "my-tasks"}
                  reduceMotion={reduceMotion}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="bookings"
            options={{
              title: "Bookings",
              tabBarIcon: () => (
                <TabIcon
                  name="calendar"
                  selected={activeTab === "bookings"}
                  reduceMotion={reduceMotion}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: "Profile",
              tabBarIcon: () => (
                <TabIcon
                  name="user"
                  selected={activeTab === "profile"}
                  reduceMotion={reduceMotion}
                />
              ),
            }}
          />
          {/*
            Notifications is intentionally NOT a bottom tab: it stays reachable
            from the fixed header bell (BrandTopNavbar) on every screen, matching
            the Airtasker layout. `href: null` keeps the /(tabs)/notifications
            route mounted and navigable while hiding it from the tab bar.
          */}
          <Tabs.Screen name="notifications" options={{ href: null }} />
        </Tabs>
      </View>
    </SafeAreaView>
  );
}

/** Keep the native/web tab semantics while suppressing all container press color. */
function PlainTabBarButton(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      android_ripple={{ ...props.android_ripple, borderless: false, color: "transparent" }}
      pressColor="transparent"
      pressOpacity={1}
    />
  );
}

type TabIconProps = {
  readonly name: IconName;
  readonly selected: boolean;
  readonly reduceMotion: boolean;
};

/** Briefly lift the newly selected icon, then leave color as its only selected treatment. */
function TabIcon({ name, selected, reduceMotion }: TabIconProps) {
  const pulseProgress = useRef(new Animated.Value(0)).current;
  const wasSelected = useRef(selected);

  useEffect(() => {
    const becameSelected = selected && !wasSelected.current;
    wasSelected.current = selected;
    pulseProgress.stopAnimation();
    pulseProgress.setValue(0);

    if (!becameSelected || reduceMotion) return;

    Animated.sequence([
      Animated.timing(pulseProgress, {
        toValue: 1,
        duration: TAB_ICON_LIFT_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(pulseProgress, {
        toValue: 0,
        duration: TAB_ICON_SETTLE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [pulseProgress, reduceMotion, selected]);

  const iconTranslateY = pulseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2],
  });
  const iconScale = pulseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <Animated.View style={{ transform: [{ translateY: iconTranslateY }, { scale: iconScale }] }}>
      <Icon name={name} size={22} color={selected ? theme.primary : theme.textSecondary} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  tabContent: {
    flex: 1,
  },
});
