import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
import { ConnectivityProvider } from "../src/providers/ConnectivityProvider";
import { SessionProvider } from "../src/providers/SessionProvider";
import { MarketplaceProvider } from "../src/providers/MarketplaceProvider";
import { CategoriesProvider } from "../src/providers/CategoriesProvider";
import { theme } from "../src/theme";

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
                  {/*
                    `backgroundColor` was removed from expo-status-bar in SDK 57.
                    The Android status bar colour is now declared once in
                    `app.json` under `androidStatusBar`, which keeps it consistent
                    with the light theme's background token.
                  */}
                  <StatusBar style="dark" />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      // Every screen that opts into a native header (via
                      // `Stack.Screen options={{ headerShown: true, title }}`)
                      // inherits this brand styling, so the header is visually
                      // consistent across the whole app instead of falling back
                      // to React Navigation's unstyled default header.
                      headerStyle: { backgroundColor: theme.surface },
                      headerTitleStyle: { color: theme.textPrimary, fontWeight: "700" },
                      headerTintColor: theme.primary,
                      headerShadowVisible: false,
                      headerBackTitle: "",
                    }}
                  />
                </CategoriesProvider>
              </MarketplaceProvider>
            </SessionProvider>
          </ConnectivityProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
