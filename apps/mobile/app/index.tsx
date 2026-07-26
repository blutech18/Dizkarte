import { Redirect } from "expo-router";
import { useSession } from "../src/providers/SessionProvider";
import { LoadingState } from "../src/components/ui/AsyncState";

/**
 * Navigation gate. Protected routes never render for a signed-out session —
 * this index route is the single place deciding where to send the user, so
 * individual screens do not each re-implement the redirect logic.
 */
export default function Index() {
  const { status } = useSession();

  if (status === "loading") {
    return <LoadingState label="Starting Dizkarte" />;
  }

  if (status === "signed-in") {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
