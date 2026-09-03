import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PlaceSuggestion } from "@dizkarte/domain";
import * as Location from "expo-location";
import { Icon } from "../ui/Icon";
import { getMapProvider } from "../../services/map/factory";
import { useSession } from "../../providers/SessionProvider";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import type { TaskDraftFormValue } from "./taskDraftValue";
import { theme, spacing, fontSize, radii, noWebOutline } from "../../theme";

export const DEFAULT_SUGGESTED_SUBURBS = [
  "Quezon City, Metro Manila",
  "Makati City, Metro Manila",
  "BGC, Taguig City, Metro Manila",
  "Pasig City, Metro Manila",
  "Cagayan de Oro City, Misamis Oriental",
  "Cebu City, Cebu",
  "Davao City, Davao del Sur",
  "Iloilo City, Iloilo",
  "Baguio City, Benguet",
];

export async function getDynamicSuggestedSuburbs({
  userId,
  repository,
  userCityHint,
  userProvinceHint,
}: {
  readonly userId?: string | null;
  readonly repository?: {
    getBillingAddress?: (userId: string) => Promise<{
      line1?: string;
      city?: string;
      province?: string | null;
    } | null>;
    searchCities?: (keyword: string) => Promise<ReadonlyArray<{ city6: string; name: string }>>;
    searchBarangays?: (
      city6: string,
      keyword: string,
    ) => Promise<ReadonlyArray<{ code: string; name: string }>>;
  } | null;
  readonly userCityHint?: string | null;
  readonly userProvinceHint?: string | null;
}): Promise<string[]> {
  const list: string[] = [];

  // 1. Check user's saved billing address
  if (userId && repository?.getBillingAddress) {
    try {
      const billing = await repository.getBillingAddress(userId);
      if (billing) {
        if (billing.line1 && billing.city) {
          list.push(`${billing.line1}, ${billing.city}`);
        }
        if (billing.city) {
          const cityWithProv = billing.province
            ? `${billing.city}, ${billing.province}`
            : billing.city;
          list.push(cityWithProv);
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Check device's last known position if permissions are available
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === "granted") {
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
        });
        if (geo) {
          const parts: string[] = [];
          if (geo.district) parts.push(geo.district);
          if (geo.city && !parts.includes(geo.city)) parts.push(geo.city);
          if (geo.region && !parts.includes(geo.region)) parts.push(geo.region);
          if (parts.length > 0) list.push(parts.join(", "));
        }
      }
    }
  } catch {
    // ignore
  }

  // 3. User city / province hint from current draft
  if (userCityHint) {
    const hint = userProvinceHint
      ? `${userCityHint}, ${userProvinceHint}`
      : userCityHint;
    list.push(hint);
  }

  // 4. Query repository for local barangays in user's primary city
  const primaryCity = userCityHint || list[0]?.split(",")[0]?.trim();
  if (primaryCity && repository?.searchCities && repository?.searchBarangays) {
    try {
      const cities = await repository.searchCities(primaryCity);
      if (cities.length > 0) {
        const city = cities[0];
        const barangays = await repository.searchBarangays(city.city6, "");
        for (const b of barangays.slice(0, 4)) {
          list.push(`${b.name}, ${city.name}`);
        }
      }
    } catch {
      // ignore
    }
  }

  // 5. Append standard regional hubs to complete the list
  for (const hub of DEFAULT_SUGGESTED_SUBURBS) {
    list.push(hub);
  }

  // Deduplicate case-insensitively while preserving order
  const seen = new Set<string>();
  const uniqueList: string[] = [];
  for (const item of list) {
    const normalized = item.toLowerCase().trim();
    if (!seen.has(normalized) && normalized.length > 0) {
      seen.add(normalized);
      uniqueList.push(item);
    }
  }

  return uniqueList.slice(0, 10);
}

type SelectableLocation = PlaceSuggestion & {
  readonly exactAddress?: string;
  readonly cityHint?: string | null;
  readonly barangayHint?: string | null;
};

export type LocationSelection = PlaceSuggestion & {
  readonly exactAddress: string;
  readonly cityHint?: string | null;
  readonly barangayHint?: string | null;
};

export type TaskLocationPatch = Pick<
  TaskDraftFormValue,
  "landmark" | "exactAddress" | "approximateLat" | "approximateLng" | "exactLat" | "exactLng"
>;

export type LocalityResolution = {
  readonly cityCode?: string;
  readonly cityName?: string;
  readonly barangayCode?: string | null;
  readonly barangayName?: string | null;
};

/**
 * Resolve canonical PSGC city/municipality and barangay codes from a map selection.
 */
export async function resolvePsgcLocality(
  repository: {
    searchCities: (keyword: string) => Promise<ReadonlyArray<{ city6: string; name: string }>>;
    searchBarangays: (
      city6: string,
      keyword: string,
    ) => Promise<ReadonlyArray<{ code: string; name: string }>>;
  },
  selection: LocationSelection,
): Promise<LocalityResolution> {
  try {
    const cityCandidates = [
      selection.cityHint,
      ...selection.description.split(",").map((p) => p.trim()),
    ].filter((c): c is string => Boolean(c && c.length >= 2));

    let matchedCity: { city6: string; name: string } | null = null;
    for (const cand of cityCandidates) {
      const cleanCand = cand
        .replace(/\s+(city|municipality)$/i, "")
        .replace(/^(city\s+of|municipality\s+of)\s+/i, "")
        .trim();
      const results = await repository.searchCities(cleanCand || cand);
      if (results.length > 0) {
        const exact = results.find(
          (c) =>
            c.name.toLowerCase() === cand.toLowerCase() ||
            c.name.toLowerCase() === cleanCand.toLowerCase() ||
            c.name.toLowerCase().includes(cleanCand.toLowerCase()),
        );
        matchedCity = exact ?? results[0];
        break;
      }
    }

    if (!matchedCity) return {};

    const patch: LocalityResolution = {
      cityCode: matchedCity.city6,
      cityName: matchedCity.name,
      barangayCode: null,
      barangayName: null,
    };

    const barangayCandidates = [
      selection.barangayHint,
      ...selection.description.split(",").map((p) => p.trim()),
    ]
      .filter((b): b is string => Boolean(b && b.length >= 2))
      .map((b) => b.replace(/^(brgy\.?|barangay)\s*/i, "").trim());

    for (const bCand of barangayCandidates) {
      if (bCand.toLowerCase() === matchedCity.name.toLowerCase()) continue;
      const bResults = await repository.searchBarangays(matchedCity.city6, bCand);
      if (bResults.length > 0) {
        const exactB = bResults.find(
          (b) =>
            b.name.toLowerCase() === bCand.toLowerCase() ||
            b.name.toLowerCase().includes(bCand.toLowerCase()),
        );
        const chosen = exactB ?? bResults[0];
        return {
          ...patch,
          barangayCode: chosen.code,
          barangayName: chosen.name,
        };
      }
    }

    return patch;
  } catch {
    return {};
  }
}

/**
 * Convert a picker result into the exact draft fields persisted by both
 * Create and Edit. Keeping this projection shared prevents one flow from
 * storing raw GPS coordinates while the other applies the public offset.
 */
export function locationSelectionToDraftPatch(selection: LocationSelection): TaskLocationPatch {
  const mapProvider = getMapProvider();
  const approximate = mapProvider
    ? mapProvider.approximate(selection.lat, selection.lng)
    : { lat: selection.lat, lng: selection.lng };

  return {
    landmark: selection.description,
    exactAddress: selection.exactAddress,
    approximateLat: approximate.lat,
    approximateLng: approximate.lng,
    exactLat: selection.lat,
    exactLng: selection.lng,
  };
}

/** Google may prefix a reverse-geocoded address with an Open Location Code. */
function cleanLocationLabel(input: string): string {
  return input
    .replace(/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3},?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep the public field area-level; the full result remains private. */
function publicAreaLabel(input: string): string {
  const parts = cleanLocationLabel(input)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  if (/^(philippines|australia)$/i.test(parts.at(-1) ?? "")) parts.pop();
  return parts.slice(-2).join(", ");
}

export function LocationSearchModal({
  visible,
  onSelect,
  onClose,
  userCityHint,
  userProvinceHint,
}: {
  readonly visible: boolean;
  readonly onSelect: (selection: LocationSelection) => void;
  readonly onClose: () => void;
  readonly userCityHint?: string | null;
  readonly userProvinceHint?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { repository } = useMarketplace();
  const [suggestedSuburbs, setSuggestedSuburbs] =
    useState<ReadonlyArray<string>>(DEFAULT_SUGGESTED_SUBURBS);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReadonlyArray<PlaceSuggestion>>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;

    void getDynamicSuggestedSuburbs({
      userId: session?.userId,
      repository,
      userCityHint,
      userProvinceHint,
    }).then((list) => {
      if (active && list.length > 0) {
        setSuggestedSuburbs(list);
      }
    });

    return () => {
      active = false;
    };
  }, [visible, session?.userId, repository, userCityHint, userProvinceHint]);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setSearched(false);
      setLocError(null);
      setResolving(false);
      setLocating(false);
    }
  }, [visible]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      setLocError(null);
      return;
    }

    const mapProvider = getMapProvider();
    if (!mapProvider) {
      setResults([]);
      setLoading(false);
      setSearched(true);
      setLocError("Location search is unavailable. Please try again shortly.");
      return;
    }

    let active = true;
    setLoading(true);
    setLocError(null);
    const timer = setTimeout(async () => {
      try {
        const found = await mapProvider.searchPlaces(trimmed);
        if (active) setResults(found);
      } catch {
        if (active) {
          setResults([]);
          setLocError("Location search failed. Check your connection and try again.");
        }
      } finally {
        if (active) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  function choose(selection: SelectableLocation) {
    const exactAddress = cleanLocationLabel(selection.exactAddress ?? selection.description);
    const description = selection.exactAddress
      ? cleanLocationLabel(selection.description)
      : publicAreaLabel(exactAddress);

    onSelect({
      ...selection,
      description: description || selection.description.trim(),
      exactAddress,
    });
    setQuery("");
    setResults([]);
    setSearched(false);
  }

  async function resolveAndChoose(description: string) {
    const mapProvider = getMapProvider();
    if (!mapProvider) {
      setLocError("Location search is unavailable. Please try again shortly.");
      return;
    }

    setLocError(null);
    setResolving(true);
    try {
      const [first] = await mapProvider.searchPlaces(description);
      if (first) {
        choose(first);
        return;
      }
      const coords = await mapProvider.geocode(description);
      if (coords) {
        choose({
          description: publicAreaLabel(description),
          ...coords,
          cityHint: description.split(",")[0]?.trim(),
        });
        return;
      }
      setLocError("We couldn't locate that address. Try adding a city or barangay.");
    } catch {
      setLocError("Location search failed. Check your connection and try again.");
    } finally {
      setResolving(false);
    }
  }

  async function useCurrentLocation() {
    setLocError(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocError("Location permission is off. Enable it in Settings or search manually.");
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;

      let providerAddress: string | null = null;
      const mapProvider = getMapProvider();
      if (mapProvider) {
        const reverse = await mapProvider.reverseGeocode(latitude, longitude);
        providerAddress = reverse?.address ?? null;
      }

      let deviceAddress: Location.LocationGeocodedAddress | undefined;
      try {
        [deviceAddress] = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
      } catch {
        // The secure map-provider result remains usable.
      }

      const deviceFormattedAddress =
        deviceAddress?.formattedAddress ??
        [
          deviceAddress?.streetNumber,
          deviceAddress?.street,
          deviceAddress?.district,
          deviceAddress?.city,
          deviceAddress?.region,
          deviceAddress?.postalCode,
          deviceAddress?.country,
        ]
          .filter((part): part is string => Boolean(part))
          .join(", ");
      const exactAddress =
        deviceFormattedAddress ||
        providerAddress ||
        `My location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

      const cityHint = deviceAddress?.city || deviceAddress?.subregion || null;
      const barangayHint = deviceAddress?.district || null;

      // Extract clean suburb / locality (e.g. "Diliman, Quezon City" or "Makati City")
      // instead of the full precise street address.
      const suburbParts: string[] = [];
      if (deviceAddress?.district) suburbParts.push(deviceAddress.district);
      if (deviceAddress?.city && !suburbParts.includes(deviceAddress.city)) {
        suburbParts.push(deviceAddress.city);
      }
      let suburbOnly = suburbParts.join(", ");
      if (!suburbOnly) {
        suburbOnly = publicAreaLabel(providerAddress ?? exactAddress);
      }

      choose({
        description: suburbOnly,
        exactAddress,
        lat: latitude,
        lng: longitude,
        cityHint,
        barangayHint,
      });
    } catch {
      setLocError("Couldn't get your location. Please try again or search manually.");
    } finally {
      setLocating(false);
    }
  }

  const trimmed = query.trim();
  const showStarter = trimmed.length === 0;
  const hasExactMatch = results.some(
    (result) => result.description.toLowerCase() === trimmed.toLowerCase(),
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.searchRow}>
            <Icon name="search" size={18} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search for a place or address"
              placeholderTextColor={theme.textSecondary}
              underlineColorAndroid="transparent"
              autoFocus
              spellCheck={false}
              returnKeyType="search"
              style={[styles.searchInput, noWebOutline]}
            />
            {loading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : query ? (
              <Pressable
                onPress={() => setQuery("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Icon name="close" size={16} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            style={styles.cancelButton}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.results}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {showStarter ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.currentLocationButton,
                  pressed && !locating ? styles.resultItemPressed : null,
                ]}
                onPress={() => void useCurrentLocation()}
                disabled={locating}
                accessibilityRole="button"
                accessibilityLabel="Use current location"
                accessibilityState={{ disabled: locating, busy: locating }}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Icon name="map-pin" size={18} color={theme.primary} />
                )}
                <Text style={styles.currentLocationText}>
                  {locating ? "Getting your location..." : "Use current location"}
                </Text>
              </Pressable>
              {locError ? <Text style={styles.message}>{locError}</Text> : null}
              <Text style={styles.sectionLabel}>Suggested places</Text>
              {suggestedSuburbs.map((item) => (
                <Pressable
                  key={item}
                  style={({ pressed }) => [
                    styles.resultItem,
                    pressed ? styles.resultItemPressed : null,
                  ]}
                  onPress={() => void resolveAndChoose(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item}
                >
                  <Icon name="map-pin" size={17} color={theme.textSecondary} />
                  <Text style={styles.resultText}>{item}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              {locError ? <Text style={styles.message}>{locError}</Text> : null}
              {results.map((result, index) => (
                <Pressable
                  key={`${result.description}-${index}`}
                  style={({ pressed }) => [
                    styles.resultItem,
                    pressed ? styles.resultItemPressed : null,
                  ]}
                  onPress={() => choose(result)}
                  accessibilityRole="button"
                  accessibilityLabel={result.description}
                >
                  <Icon name="map-pin" size={17} color={theme.primary} />
                  <Text style={styles.resultText} numberOfLines={2}>
                    {result.description}
                  </Text>
                </Pressable>
              ))}

              {!loading && searched && results.length === 0 && !locError ? (
                <Text style={styles.message}>No matches for "{trimmed}".</Text>
              ) : null}

              {!loading && !hasExactMatch && !locError ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.resultItem,
                    pressed ? styles.resultItemPressed : null,
                  ]}
                  onPress={() => void resolveAndChoose(trimmed)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${trimmed}`}
                >
                  <Icon name="map-pin" size={17} color={theme.primary} />
                  <Text style={styles.useTypedText}>Use "{trimmed}"</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>

        {resolving || locating ? (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={styles.loadingText}>
                {locating ? "Getting your location..." : "Loading location..."}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchRow: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: theme.textPrimary,
    padding: 0,
    borderWidth: 0,
  },
  cancelButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  cancelText: {
    fontSize: fontSize.md,
    color: theme.primary,
    fontWeight: "600",
  },
  results: { flex: 1 },
  currentLocationButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.xs,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  currentLocationText: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.primary,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  resultItem: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.xs,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  resultItemPressed: {
    backgroundColor: theme.surfaceSubtle,
  },
  resultText: {
    flex: 1,
    fontSize: fontSize.md,
    color: theme.textPrimary,
  },
  useTypedText: {
    flex: 1,
    fontSize: fontSize.md,
    color: theme.primary,
    fontWeight: "700",
  },
  message: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  loadingCard: {
    minWidth: 200,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  loadingText: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: theme.textPrimary,
    textAlign: "center",
  },
});
