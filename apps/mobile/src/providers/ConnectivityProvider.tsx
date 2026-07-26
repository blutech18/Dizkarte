import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";

/**
 * Lightweight connectivity signal.
 *
 * A dedicated network-info package (e.g. `@react-native-community/netinfo`)
 * would give a real online/offline signal from the OS. That package is not
 * yet part of this pass's pinned dependency set, so this provider currently
 * reflects app foreground/background state and exposes a manual `retry`
 * trigger; screens that fetch data key their retry affordance off this
 * context so the offline/retry UI pattern is consistent even before a native
 * connectivity API is wired in.
 */
type ConnectivityContextValue = {
  readonly isAppActive: boolean;
  readonly retryTick: number;
  readonly retry: () => void;
};

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

export function ConnectivityProvider({ children }: { readonly children: ReactNode }) {
  const [isAppActive, setIsAppActive] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setIsAppActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  const value: ConnectivityContextValue = {
    isAppActive,
    retryTick,
    retry: () => setRetryTick((tick) => tick + 1),
  };

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityContextValue {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error("useConnectivity must be used within a ConnectivityProvider");
  }
  return context;
}
