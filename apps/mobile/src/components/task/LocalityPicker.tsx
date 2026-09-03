import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../ui/Icon";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import { useScreenScroll } from "../../providers/ScreenScrollContext";
import type { PsgcBarangay, PsgcCity } from "../../services/marketplace";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  noWebOutline,
} from "../../theme";

export type LocalityValue = {
  /** 6-digit PSGC city/municipality code (stored as `city_code`). */
  readonly cityCode: string | null;
  /** 9-digit PSGC barangay code (stored as `barangay_code`). */
  readonly barangayCode: string | null;
  /** Optional resolved labels used by filter summaries; codes remain authoritative. */
  readonly cityName?: string | null;
  readonly barangayName?: string | null;
};

export type LocalityPickerProps = {
  readonly value: LocalityValue;
  readonly onChange: (next: LocalityValue) => void;
  readonly cityRequired?: boolean;
  readonly barangayRequired?: boolean;
  /** Copy tweaks so the same picker fits "Service area" and "Task location". */
  readonly cityLabel?: string;
  readonly barangayLabel?: string;
  /** Fill available rows and wrap fields on narrow screens. */
  readonly responsive?: boolean;
  readonly onOpen?: (() => void) | undefined;
  readonly onClose?: (() => void) | undefined;
};

type PickerMode = "city" | "barangay";

/**
 * Name-based PSGC city/municipality + barangay picker (decision D14).
 *
 * Users search by name — nobody in the Philippines knows their 6-digit PSGC
 * code — and the picker stores the official codes behind the scenes (6-digit
 * `city_code`, 9-digit `barangay_code`). Data is the canonical PSGC dataset read
 * from Supabase, so this covers the whole country. Selecting a new city resets
 * the barangay, since barangays are scoped to their city.
 */
export function LocalityPicker({
  value,
  onChange,
  cityRequired = false,
  barangayRequired = false,
  cityLabel = "City / Municipality",
  barangayLabel = "Barangay",
  responsive = false,
  onOpen,
  onClose,
}: LocalityPickerProps) {
  const insets = useSafeAreaInsets();
  const { repository } = useMarketplace();
  const screenScroll = useScreenScroll();
  const containerRef = useRef<View>(null);
  const [cityName, setCityName] = useState<string | null>(value.cityName ?? null);
  const [barangayName, setBarangayName] = useState<string | null>(value.barangayName ?? null);
  const [picking, setPicking] = useState<PickerMode | null>(null);
  const activePicker = useRef<PickerMode>("city");
  const [query, setQuery] = useState("");
  const [cityResults, setCityResults] = useState<ReadonlyArray<PsgcCity>>([]);
  const [barangayResults, setBarangayResults] = useState<ReadonlyArray<PsgcBarangay>>([]);
  const [loading, setLoading] = useState(false);

  // Resolve display names for pre-existing codes (edit/prefill).
  useEffect(() => {
    let active = true;
    if (value.cityCode) {
      if (value.cityName) {
        setCityName(value.cityName);
      } else {
        void repository.getCityByCode(value.cityCode).then((city) => {
          if (active) setCityName(city?.name ?? null);
        });
      }
    } else {
      setCityName(null);
    }
    return () => {
      active = false;
    };
  }, [value.cityCode, value.cityName, repository]);

  useEffect(() => {
    let active = true;
    if (value.barangayCode) {
      if (value.barangayName) {
        setBarangayName(value.barangayName);
      } else {
        void repository.getBarangayByCode(value.barangayCode).then((barangay) => {
          if (active) setBarangayName(barangay?.name ?? null);
        });
      }
    } else {
      setBarangayName(null);
    }
    return () => {
      active = false;
    };
  }, [value.barangayCode, value.barangayName, repository]);

  // Search results loader with immediate load on open and debounced typing.
  useEffect(() => {
    if (!picking) return;
    let active = true;
    setLoading(true);

    const performSearch = async () => {
      try {
        if (picking === "city") {
          const results = await repository.searchCities(query);
          if (active) setCityResults(results);
        } else if (value.cityCode) {
          const results = await repository.searchBarangays(value.cityCode, query);
          if (active) setBarangayResults(results);
        }
      } catch {
        if (active) {
          setCityResults([]);
          setBarangayResults([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    if (query.trim().length === 0) {
      void performSearch();
      return () => {
        active = false;
      };
    }

    const handle = setTimeout(performSearch, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [picking, query, value.cityCode, repository]);

  const closePicker = useCallback(() => {
    setPicking(null);
    screenScroll?.scrollToRef(containerRef);
    onClose?.();
  }, [onClose, screenScroll]);

  const openCity = useCallback(() => {
    activePicker.current = "city";
    setQuery("");
    setCityResults([]);
    setPicking("city");
    screenScroll?.scrollToRef(containerRef);
    onOpen?.();
  }, [onOpen, screenScroll]);

  const openBarangay = useCallback(() => {
    if (!value.cityCode) return;
    activePicker.current = "barangay";
    setQuery("");
    setBarangayResults([]);
    setPicking("barangay");
    screenScroll?.scrollToRef(containerRef);
    onOpen?.();
  }, [value.cityCode, onOpen, screenScroll]);

  const selectCity = useCallback(
    (city: PsgcCity) => {
      // A new city invalidates any previously chosen barangay.
      onChange({
        cityCode: city.city6,
        barangayCode: null,
        cityName: city.name,
        barangayName: null,
      });
      setCityName(city.name);
      setBarangayName(null);
      closePicker();
    },
    [closePicker, onChange],
  );

  const selectBarangay = useCallback(
    (barangay: PsgcBarangay) => {
      onChange({
        cityCode: value.cityCode,
        barangayCode: barangay.code,
        cityName: cityName ?? value.cityName ?? null,
        barangayName: barangay.name,
      });
      setBarangayName(barangay.name);
      closePicker();
    },
    [closePicker, onChange, value.cityCode, value.cityName, cityName],
  );

  const pickerMode = picking ?? activePicker.current;
  const selectingCity = pickerMode === "city";
  const searchPlaceholder = selectingCity
    ? "Search for a city or municipality"
    : `Search barangay in ${cityName ?? "city"}`;

  return (
    <View
      ref={containerRef}
      style={[styles.container, responsive ? styles.containerResponsive : null]}
    >
      <SelectRow
        label={cityLabel}
        required={cityRequired}
        placeholder="Search your city or municipality"
        selectedLabel={cityName}
        responsive={responsive}
        onPress={openCity}
      />
      <SelectRow
        label={barangayLabel}
        required={barangayRequired}
        placeholder={value.cityCode ? "Search your barangay" : "Select a city first"}
        selectedLabel={barangayName}
        disabled={!value.cityCode}
        responsive={responsive}
        onPress={openBarangay}
      />

      <Modal
        visible={picking !== null}
        animationType="slide"
        onRequestClose={closePicker}
      >
        <View
          style={[
            styles.modalContainer,
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
                placeholder={searchPlaceholder}
                placeholderTextColor={theme.textSecondary}
                underlineColorAndroid="transparent"
                autoFocus
                autoCorrect={false}
                autoCapitalize="words"
                spellCheck={false}
                returnKeyType="search"
                style={[styles.searchInput, noWebOutline]}
              />
              {query ? (
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
              onPress={closePicker}
              style={styles.cancelButton}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingArea} accessibilityLiveRegion="polite">
              <ActivityIndicator color={theme.primary} />
              <Text style={styles.loadingText}>Searching locations…</Text>
            </View>
          ) : selectingCity ? (
            <FlatList
              data={cityResults}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              style={styles.results}
              contentContainerStyle={styles.resultsContent}
              ListEmptyComponent={<EmptyResults query={query} isCity />}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.provinceName ? `${item.name}, ${item.provinceName}` : item.name
                  }
                  onPress={() => selectCity(item)}
                  style={({ pressed }) => [
                    styles.resultItem,
                    pressed ? styles.resultItemPressed : null,
                  ]}
                >
                  <Icon name="map-pin" size={17} color={theme.primary} />
                  <View style={styles.resultCopy}>
                    <Text style={styles.resultTitle} numberOfLines={1} ellipsizeMode="tail">
                      {item.name}
                      {item.provinceName ? (
                        <Text style={styles.resultSubtitle}>, {item.provinceName}</Text>
                      ) : null}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          ) : (
            <FlatList
              data={barangayResults}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              style={styles.results}
              contentContainerStyle={styles.resultsContent}
              ListEmptyComponent={<EmptyResults query={query} isCity={false} />}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  onPress={() => selectBarangay(item)}
                  style={({ pressed }) => [
                    styles.resultItem,
                    pressed ? styles.resultItemPressed : null,
                  ]}
                >
                  <Icon name="map-pin" size={17} color={theme.primary} />
                  <View style={styles.resultCopy}>
                    <Text style={styles.resultTitle}>{item.name}</Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function SelectRow({
  label,
  required,
  placeholder,
  selectedLabel,
  disabled,
  responsive,
  onPress,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly placeholder: string;
  readonly selectedLabel: string | null;
  readonly disabled?: boolean;
  readonly responsive?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <View style={[styles.field, responsive ? styles.fieldResponsive : null]}>
      {label ? (
        <Text style={styles.fieldLabel}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        accessibilityLabel={selectedLabel ? `${label}: ${selectedLabel}` : placeholder}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.select,
          disabled ? styles.selectDisabled : null,
          pressed && !disabled ? styles.selectPressed : null,
        ]}
      >
        <View style={styles.locationSelectIcon}>
          <Icon
            name="map-pin"
            size={18}
            color={disabled ? theme.textSecondary : theme.primary}
          />
        </View>
        <Text
          style={[styles.selectText, selectedLabel ? null : styles.selectPlaceholder]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {selectedLabel ?? placeholder}
        </Text>
        <Icon name="arrow-right" size={18} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

function EmptyResults({
  query,
  isCity,
}: {
  readonly query: string;
  readonly isCity?: boolean;
}) {
  return (
    <Text style={styles.empty} accessibilityLiveRegion="polite">
      {query.trim().length === 0
        ? isCity
          ? "Start typing to search city."
          : "No barangays found for this city."
        : "No matches. Try a different spelling."}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  containerResponsive: { flexDirection: "row", flexWrap: "wrap" },
  field: { gap: spacing.xs },
  fieldResponsive: { flexGrow: 1, flexShrink: 1, flexBasis: 260, minWidth: 0 },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: "600", color: theme.textPrimary },
  required: { color: theme.errorSolid },
  select: {
    height: 48,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    backgroundColor: theme.surface,
  },
  locationSelectIcon: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  selectDisabled: {
    backgroundColor: theme.surfaceSubtle,
    borderColor: theme.borderSubtle,
  },
  selectPressed: {
    borderColor: theme.primary,
    backgroundColor: theme.surfaceSubtle,
  },
  selectText: { flex: 1, fontSize: fontSize.md, fontWeight: "600", color: theme.textPrimary },
  selectPlaceholder: { fontSize: fontSize.md, color: theme.textSecondary, fontWeight: "400" },
  modalContainer: {
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
  results: {
    flex: 1,
  },
  resultsContent: {
    paddingVertical: spacing.xs,
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
  resultCopy: {
    minWidth: 0,
    flex: 1,
  },
  resultTitle: {
    fontSize: fontSize.md,
    color: theme.textPrimary,
    fontWeight: "600",
  },
  resultSubtitle: {
    fontSize: fontSize.md,
    color: theme.textSecondary,
    fontWeight: "400",
  },
  loadingArea: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
  },
  empty: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },
});
