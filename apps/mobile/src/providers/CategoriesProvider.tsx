import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMarketplace } from "./MarketplaceProvider";
import { useSession } from "./SessionProvider";
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
    repository
      .listCategories()
      .then((result) => {
        if (active) setCategories(result);
      })
      .catch(() => {
        // A catalog failure must not break the screen; pickers render their own
        // empty state and the browse filter simply offers no category option.
        if (active) setCategories([]);
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
