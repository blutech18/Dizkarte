import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useSession } from "../../src/providers/SessionProvider";
import { isTasker } from "../../src/services/session-types";
import { theme } from "../../src/theme";
import { LoadingState } from "../../src/components/ui/AsyncState";
import { Icon, type IconName } from "../../src/components/ui/Icon";

/**
 * Capability-aware main navigation.
 *
 * The work/earnings tab shows "Tasker Dashboard" for approved Taskers and
 * "My Tasks" for everyone else, matching the design doc's capability-aware
 * tab requirement. Every user still sees Home, Bookings, Notifications, and
 * Profile regardless of capability. Every tab icon is a real vector icon
 * (`Icon`, via react-native-svg) — never an emoji glyph.
 */
export default function TabsLayout() {
  const { session, status } = useSession();

  if (status === "loading") {
    return <LoadingState />;
  }
  if (status === "signed-out" || !session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  const workTabLabel = isTasker(session) ? "Dashboard" : "My Tasks";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.borderSubtle },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="work"
        options={{
          title: workTabLabel,
          tabBarIcon: ({ color }) => <TabIcon name="briefcase" color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ color }) => <TabIcon name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color }) => <TabIcon name="bell" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <TabIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ name, color }: { readonly name: IconName; readonly color: ColorValue }) {
  return <Icon name={name} size={22} color={String(color)} />;
}
