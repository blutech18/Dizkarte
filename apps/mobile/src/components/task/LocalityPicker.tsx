import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BottomSheetModal } from "../ui/BottomSheetModal";
import { Icon } from "../ui/Icon";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import type { PsgcBarangay, PsgcCity } from "../../services/marketplace";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  MIN_TOUCH_TARGET,
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
}: LocalityPickerProps) {
  const { repository } = useMarketplace();
  const [cityName, setCityName] = useState<string | null>(value.cityName ?? null);
  const [barangayName, setBarangayName] = useState<string | null>(value.barangayName ?? null);
  const [picking, setPicking] = useState<PickerMode | null>(null);
  const activePicker = useRef<PickerMode>("city");
  const [query, setQuery] = useState("");
  const [cityResults, setCityResults] = useState<ReadonlyArray<PsgcCity>>([]);
  const [barangayResults, setBarangayResults] = useState<ReadonlyArray<PsgcBarangay>>([]);
  const [loading, setLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

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

  // Debounced search while the picker sheet is open.
  useEffect(() => {
    if (!picking) return;
    let active = true;
    setLoading(true);
    const handle = setTimeout(async () => {
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
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [picking, query, value.cityCode, repository]);

  const closePicker = useCallback(() => {
    setSearchFocused(false);
    setPicking(null);
  }, []);

  const openCity = useCallback(() => {
    activePicker.current = "city";
    setQuery("");
    setCityResults([]);
    setPicking("city");
  }, []);

  const openBarangay = useCallback(() => {
    if (!value.cityCode) return;
    activePicker.current = "barangay";
    setQuery("");
    setBarangayResults([]);
    setPicking("barangay");
  }, [value.cityCode]);

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
  const sheetTitle = selectingCity ? "Select city or municipality" : "Select barangay";
  const sheetDescription = selectingCity
    ? "Search the official city and municipality directory by name."
    : `Choose a barangay within ${cityName ?? "your selected city"}.`;
  const searchPlaceholder = selectingCity ? "e.g. Quezon City" : "e.g. Commonwealth";
  const searchAccessibilityLabel = selectingCity
    ? "Search for a city or municipality"
    : "Search for a barangay";

  return (
    <View style={[styles.container, responsive ? styles.containerResponsive : null]}>
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

      <BottomSheetModal visible={picking !== null} onClose={closePicker}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={styles.sheetTitle} accessibilityRole="header">
                {sheetTitle}
              </Text>
              <Text style={styles.sheetDescription}>{sheetDescription}</Text>
            </View>
            <Pressable
              onPress={closePicker}
              accessibilityRole="button"
              accessibilityLabel={`Close ${sheetTitle.toLowerCase()}`}
              hitSlop={4}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.closeButtonPressed : null,
              ]}
            >
              <Icon name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.searchArea}>
            <View style={[styles.searchField, searchFocused ? styles.searchFieldFocused : null]}>
              <Icon name="search" size={19} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                accessibilityLabel={searchAccessibilityLabel}
                placeholder={searchPlaceholder}
                placeholderTextColor={theme.textSecondary}
                autoFocus
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="search"
                spellCheck={false}
                underlineColorAndroid="transparent"
                style={[styles.searchInput, noWebOutline]}
              />
              {query ? (
                <Pressable
                  onPress={() => setQuery("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.clearButton,
                    pressed ? styles.clearButtonPressed : null,
                  ]}
                >
                  <Icon name="close" size={16} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {loading ? (
            <View style={styles.sheetLoading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={theme.primary} />
              <Text style={styles.sheetLoadingText}>Searching locations…</Text>
            </View>
          ) : selectingCity ? (
            <FlatList
              data={cityResults}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={ResultSeparator}
              ListEmptyComponent={<EmptyResults query={query} />}
              renderItem={({ item }) => (
                <ResultRow
                  title={item.name}
                  subtitle={item.provinceName ?? (item.isCity ? "City" : "Municipality")}
                  onPress={() => selectCity(item)}
                />
              )}
            />
          ) : (
            <FlatList
              data={barangayResults}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={ResultSeparator}
              ListEmptyComponent={<EmptyResults query={query} />}
              renderItem={({ item }) => (
                <ResultRow title={item.name} onPress={() => selectBarangay(item)} />
              )}
            />
          )}
        </View>
      </BottomSheetModal>
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
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
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
        <Text
          style={[styles.selectText, selectedLabel ? null : styles.selectPlaceholder]}
          numberOfLines={1}
        >
          {selectedLabel ?? placeholder}
        </Text>
        <Icon name="arrow-right" size={18} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

function ResultRow({
  title,
  subtitle,
  onPress,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.resultRow, pressed ? styles.resultRowPressed : null]}
    >
      <View style={styles.resultCopy}>
        <Text style={styles.resultTitle}>{title}</Text>
        {subtitle ? <Text style={styles.resultSubtitle}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

function ResultSeparator() {
  return <View style={styles.resultSeparator} />;
}

function EmptyResults({ query }: { readonly query: string }) {
  return (
    <Text style={styles.empty} accessibilityLiveRegion="polite">
      {query.trim().length === 0
        ? "Start typing to search."
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
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    backgroundColor: theme.surface,
  },
  selectDisabled: { backgroundColor: theme.surfaceSubtle, opacity: 0.7 },
  selectPressed: { borderColor: theme.primary },
  selectText: { flex: 1, fontSize: fontSize.md, color: theme.textPrimary },
  selectPlaceholder: { color: theme.textSecondary },
  sheet: {
    minWidth: 0,
    maxHeight: 560,
  },
  sheetHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sheetHeaderCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  sheetTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  sheetDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  closeButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  closeButtonPressed: {
    backgroundColor: theme.surfaceSubtle,
  },
  searchArea: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  searchField: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
  },
  searchFieldFocused: {
    borderColor: theme.primary,
  },
  searchInput: {
    minWidth: 0,
    minHeight: MIN_TOUCH_TARGET,
    flex: 1,
    paddingVertical: 0,
    color: theme.textPrimary,
    fontSize: fontSize.md,
  },
  clearButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
  },
  clearButtonPressed: {
    backgroundColor: theme.surfaceSubtle,
  },
  sheetLoading: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  sheetLoadingText: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  resultRow: {
    minHeight: 54,
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
  resultRowPressed: { backgroundColor: theme.surfaceSubtle },
  resultCopy: {
    minWidth: 0,
    flex: 1,
  },
  resultSeparator: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  resultTitle: { fontSize: fontSize.md, color: theme.textPrimary, fontWeight: "600" },
  resultSubtitle: {
    marginTop: 2,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
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
