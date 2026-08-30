import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMarketplace } from "./MarketplaceProvider";
import { useSession } from "./SessionProvider";
import {
  CATEGORY_CACHE_KEY,
  parseCachedCategories,
  serializeCategories,
} from "../services/marketplace/category-cache";
import type { MarketplaceCategory } from "../services/marketplace/types";

type CategoriesContextValue = {
  readonly categories: ReadonlyArray<MarketplaceCategory>;
  readonly loading: boolean;
  /**
   * Display name for a category id. Returns null while the catalog is still
   * loading or when the id is unknown, so callers decide how to render an
   * absent name rather than being handed a misleading placeholder.
   */
  readonly nameFor: (categoryId: string) => string | null;
  readonly reload: () => void;
};

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

/**
 * Loads the real service catalog once and shares it across every screen.
 *
 * Categories are referenced by `tasks.category_id`, so the picker, the browse
 * filters, and every task label must all use the same database-issued ids. A
 * locally hardcoded list would fail the foreign key on task creation and make
 * real tasks render as uncategorized, which is why this is fetched rather than
 * bundled.
 *
 * Reads are stale-while-revalidate: the last known catalog is restored from
 * local storage first so the screens that name a category can render on the
 * first frame, then the network result replaces it. The cache only ever
 * accelerates the first paint — it is never treated as authoritative, and a
 * successful fetch always wins.
 */
export function CategoriesProvider({ children }: { readonly children: ReactNode }) {
  const { repository } = useMarketplace();
  const { status } = useSession();
  const [categories, setCategories] = useState<ReadonlyArray<MarketplaceCategory>>([]);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // `categories` is readable by authenticated users only, so fetching before
    // sign-in would be a guaranteed 401. Wait for a session, and clear the
    // catalog on sign-out so a signed-out screen never shows stale data.
    if (status !== "signed-in") {
      setCategories([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    // Hydrate from the cache and revalidate concurrently: the fetch is not
    // waiting on local storage, and a cached catalog that loses the race to the
    // network is discarded rather than overwriting fresher data.
    let revalidated = false;

    AsyncStorage.getItem(CATEGORY_CACHE_KEY)
      .then((raw) => {
        if (!active || revalidated) return;
        const cached = parseCachedCategories(raw);
        if (cached) {
          setCategories(cached);
          // Screens can render real names now; the refresh continues silently.
          setLoading(false);
        }
      })
      .catch(() => {
        // An unreadable cache is not a failure — the fetch is the real source.
      });

    repository
      .listCategories()
      .then((result) => {
        revalidated = true;
        if (!active) return;
        setCategories(result);
        if (result.length > 0) {
          void AsyncStorage.setItem(CATEGORY_CACHE_KEY, serializeCategories(result)).catch(
            () => undefined,
          );
        }
      })
      .catch(() => {
        revalidated = true;
        // A catalog failure must not break the screen. Anything already restored
        // from the cache is deliberately kept — dropping it would replace usable
        // names with an empty picker over a transient network error, and a first
        // run with no cache still shows the same empty state as before.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository, reloadToken, status]);

  const nameFor = useCallback(
    (categoryId: string) => categories.find((c) => c.id === categoryId)?.name ?? null,
    [categories],
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const value = useMemo<CategoriesContextValue>(
    () => ({ categories, loading, nameFor, reload }),
    [categories, loading, nameFor, reload],
  );

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories(): CategoriesContextValue {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error("useCategories must be used within a CategoriesProvider");
  }
  return context;
}
