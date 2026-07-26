import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MobileMarketplacePort } from "../services/marketplace/port";
import { createMarketplaceRepository } from "../services/marketplace/factory";

/**
 * Shares one `MobileMarketplacePort` instance (and a cross-route refresh
 * signal) across every screen in the Client task-to-booking lifecycle and
 * the shared post-payment journey. A React context is used — rather than a
 * fresh repository per screen — because the synthetic repository holds
 * in-memory state (tasks, offers, bookings, messages, notifications) that
 * must stay consistent as the user navigates between `task/[id]`,
 * `booking/[id]`, `chat/[bookingId]`, etc.
 */
type MarketplaceContextValue = {
  readonly repository: MobileMarketplacePort;
  /** Monotonic counter screens can watch to know when to refetch shared lists. */
  readonly revision: number;
  readonly notifyChanged: () => void;
};

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export function MarketplaceProvider({ children }: { readonly children: ReactNode }) {
  const repositoryRef = useRef<MobileMarketplacePort | null>(null);
  repositoryRef.current ??= createMarketplaceRepository();
  const [revision, setRevision] = useState(0);

  const notifyChanged = useCallback(() => setRevision((r) => r + 1), []);

  const value = useMemo<MarketplaceContextValue>(
    () => ({ repository: repositoryRef.current!, revision, notifyChanged }),
    [revision, notifyChanged],
  );

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}

export function useMarketplace(): MarketplaceContextValue {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error("useMarketplace must be used within a MarketplaceProvider");
  }
  return context;
}
