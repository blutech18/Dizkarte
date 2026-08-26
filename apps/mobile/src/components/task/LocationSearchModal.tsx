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
import type { TaskDraftFormValue } from "./taskDraftValue";
import { theme, spacing, fontSize, radii, noWebOutline } from "../../theme";

const SUGGESTED_SUBURBS = [
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

type SelectableLocation = PlaceSuggestion & {
  readonly exactAddress?: string;
};

export type LocationSelection = PlaceSuggestion & {
  readonly exactAddress: string;
};

export type TaskLocationPatch = Pick<
  TaskDraftFormValue,
  "landmark" | "exactAddress" | "approximateLat" | "approximateLng" | "exactLat" | "exactLng"
>;

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
}: {
  readonly visible: boolean;
  readonly onSelect: (selection: LocationSelection) => void;
  readonly onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReadonlyArray<PlaceSuggestion>>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

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
        choose({ description, ...coords });
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

      const publicLabel =
        [
          deviceAddress?.district,
          deviceAddress?.city,
          deviceAddress?.subregion,
          deviceAddress?.region,
          deviceAddress?.country,
        ]
          .filter((part): part is string => Boolean(part))
          .filter((part, index, parts) => parts.indexOf(part) === index)
          .join(", ") || cleanLocationLabel(providerAddress ?? exactAddress);

      choose({
        description: publicLabel,
        exactAddress,
        lat: latitude,
        lng: longitude,
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
                style={styles.currentLocationButton}
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
              {SUGGESTED_SUBURBS.map((item) => (
                <Pressable
                  key={item}
                  style={styles.resultItem}
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
                  style={styles.resultItem}
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
                  style={styles.resultItem}
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
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
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
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
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
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
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
