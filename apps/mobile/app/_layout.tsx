import { Stack as NativeStack } from "expo-router";
import { Stack as WebStack } from "expo-router/js-stack";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
import { ConnectivityProvider } from "../src/providers/ConnectivityProvider";
import { SessionProvider } from "../src/providers/SessionProvider";
import { MarketplaceProvider } from "../src/providers/MarketplaceProvider";
import { CategoriesProvider } from "../src/providers/CategoriesProvider";
import { NotificationsProvider } from "../src/providers/NotificationsProvider";
import { theme, fontSize } from "../src/theme";

/**
 * Native stack transitions are rendered by react-native-screens on devices,
 * while web needs the JavaScript stack so both push and pop cards animate.
 */
const RootStack = Platform.OS === "web" ? WebStack : NativeStack;

/**
 * Root Expo Router layout.
 *
 * Wraps the whole app in the session/connectivity providers and a top-level
 * error boundary. Route groups below decide which screens are reachable for
 * signed-out vs. signed-in users; the actual navigation gate lives in
 * `app/index.tsx` and the `(tabs)` layout, not here.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <ConnectivityProvider>
            <SessionProvider>
              <MarketplaceProvider>
                <CategoriesProvider>
                  <NotificationsProvider>
                    {/*
                    SDK 57 runs edge-to-edge: the Android status bar is
                    transparent and content draws behind it, so there is no
                    status-bar background colour to declare (the legacy
                    `androidStatusBar` config is a no-op under edge-to-edge).
                    `style="dark"` keeps the clock and icons dark against the
                    light theme; the area behind the bar shows each screen's
                    SafeArea background (`theme.background`).
                  */}
                    <StatusBar style="dark" />
                    <RootStack
                      screenOptions={{
                        headerShown: false,
                        animation: "slide_from_right",
                        gestureEnabled: true,
                        contentStyle: { backgroundColor: theme.background },
                        // On web the JS stack (expo-router/js-stack) renders each
                        // full-screen card with `minHeight: 100%` and delegates
                        // scrolling to document.body. This app uses a sticky
                        // in-screen header + an inner ScrollView (see Screen.tsx),
                        // and Expo's web reset suppresses body scroll — so pushed
                        // stack screens (e.g. /booking/[id], /task/[id]/preview,
                        // /task/[id]/owned) could not scroll at all, while native
                        // and tab screens (bounded by bottom-tabs) did. Forcing the
                        // card content to a bounded flex box gives that inner
                        // ScrollView a real viewport. `cardStyle` is a JS-stack
                        // (web) option; the native stack ignores it.
                        ...(Platform.OS === "web"
                          ? { cardStyle: { flex: 1, minHeight: 0 } }
                          : null),
                        headerStyle: { backgroundColor: theme.primary },
                        headerTitleStyle: {
                          color: theme.onPrimary,
                          fontWeight: "700",
                          fontSize: fontSize.lg,
                        },
                        headerTintColor: theme.onPrimary,
                        headerShadowVisible: false,
                        headerBackTitle: "",
                      }}
                    >
                      <RootStack.Screen
                        name="task/create"
                        options={{
                          animation: "slide_from_right",
                          presentation: "card",
                        }}
                      />
                      <RootStack.Screen
                        name="task/[id]"
                        options={{
                          animation: "slide_from_right",
                        }}
                      />
                    </RootStack>
                  </NotificationsProvider>
                </CategoriesProvider>
              </MarketplaceProvider>
            </SessionProvider>
          </ConnectivityProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
