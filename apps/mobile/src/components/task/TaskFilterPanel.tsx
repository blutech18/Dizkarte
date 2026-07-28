import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useCategories } from "../../providers/CategoriesProvider";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";
import { theme, spacing, fontSize, radii, MIN_TOUCH_TARGET } from "../../theme";
import {
  DEFAULT_TASK_FILTERS,
  DEV_REFERENCE_AREAS,
  SORT_OPTIONS,
  dateOnlyToIso,
  describeActiveFilters as describeActiveFiltersRaw,
  isoToDateOnly,
  validateTaskFilterDraft,
  type ReferenceAreaId,
  type TaskFeedSort,
  type TaskFilterState,
} from "./taskFilterQuery";

export {
  buildTaskSearchQuery,
  DEFAULT_TASK_FILTERS,
  DEV_REFERENCE_AREAS,
  findReferenceArea,
  validateTaskFilterDraft,
  type ReferenceArea,
  type ReferenceAreaId,
  type TaskFeedSort,
  type TaskFilterState,
  type TaskSearchQuery,
} from "./taskFilterQuery";

/**
 * Human-readable chip summary of every applied filter.
 *
 * A hook rather than a plain function because the category label now comes from
 * the live catalog: resolving it against a bundled list would show a stale or
 * missing name for any category added since the build.
 */
export function useActiveFilterChips(filters: TaskFilterState): ReadonlyArray<string> {
  const { nameFor } = useCategories();
  return describeActiveFiltersRaw(filters, (categoryId) => nameFor(categoryId) ?? undefined);
}

export type TaskFilterPanelProps = {
  readonly visible: boolean;
  readonly filters: TaskFilterState;
  readonly onApply: (next: TaskFilterState) => void;
  readonly onClose: () => void;
  readonly distanceAvailable: boolean;
};

/** Modal filter/sort form validated against the shared discovery bounds contract. */
export function TaskFilterPanel({
  visible,
  filters,
  onApply,
  onClose,
  distanceAvailable,
}: TaskFilterPanelProps) {
  const { categories } = useCategories();
  const [categoryId, setCategoryId] = useState<string | undefined>(filters.categoryId);
  const [minBudget, setMinBudget] = useState(
    filters.minBudgetCentavos ? String(filters.minBudgetCentavos / 100) : "",
  );
  const [maxBudget, setMaxBudget] = useState(
    filters.maxBudgetCentavos ? String(filters.maxBudgetCentavos / 100) : "",
  );
  const [sameDayOnly, setSameDayOnly] = useState(filters.sameDayOnly ?? false);
  const [scheduledFrom, setScheduledFrom] = useState(isoToDateOnly(filters.scheduledFrom));
  const [scheduledTo, setScheduledTo] = useState(isoToDateOnly(filters.scheduledTo));
  const [areaId, setAreaId] = useState<ReferenceAreaId | undefined>(filters.areaId);
  const [radiusKm, setRadiusKm] = useState(filters.radiusKm ? String(filters.radiusKm) : "");
  const [sort, setSort] = useState<TaskFeedSort>(filters.sort);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleApply() {
    const validation = validateTaskFilterDraft({
      minBudget,
      maxBudget,
      scheduledFrom,
      scheduledTo,
      radiusKm,
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    const minCentavos = minBudget.trim() ? Math.round(Number(minBudget) * 100) : undefined;
    const maxCentavos = maxBudget.trim() ? Math.round(Number(maxBudget) * 100) : undefined;
    const fromIso = dateOnlyToIso(scheduledFrom, false);
    const toIso = dateOnlyToIso(scheduledTo, true);
    const resolvedAreaId = distanceAvailable ? areaId : undefined;
    const radius =
      distanceAvailable && resolvedAreaId && radiusKm.trim()
        ? Math.round(Number(radiusKm) * 10) / 10
        : undefined;
    const resolvedSort =
      sort === "nearby" && (!distanceAvailable || !resolvedAreaId) ? "newest" : sort;
    onApply({
      sort: resolvedSort,
      ...(categoryId ? { categoryId } : {}),
      ...(typeof minCentavos === "number" ? { minBudgetCentavos: minCentavos } : {}),
      ...(typeof maxCentavos === "number" ? { maxBudgetCentavos: maxCentavos } : {}),
      ...(sameDayOnly ? { sameDayOnly: true } : {}),
      ...(fromIso ? { scheduledFrom: fromIso } : {}),
      ...(toIso ? { scheduledTo: toIso } : {}),
      ...(resolvedAreaId ? { areaId: resolvedAreaId } : {}),
      ...(typeof radius === "number" ? { radiusKm: radius } : {}),
    });
  }

  function handleClear() {
    setCategoryId(undefined);
    setMinBudget("");
    setMaxBudget("");
    setSameDayOnly(false);
    setScheduledFrom("");
    setScheduledTo("");
    setAreaId(undefined);
    setRadiusKm("");
    setSort("newest");
    setErrors({});
    onApply(DEFAULT_TASK_FILTERS);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Filter & sort</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close filters"
              style={styles.closeButton}
            >
              <Text style={styles.closeLabel}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.chipRow} accessibilityRole="radiogroup">
              <Pressable
                onPress={() => setCategoryId(undefined)}
                accessibilityRole="radio"
                accessibilityState={{ checked: categoryId === undefined }}
                accessibilityLabel="Any category"
                style={[styles.chip, categoryId === undefined ? styles.chipActive : null]}
              >
                <Text style={categoryId === undefined ? styles.chipTextActive : styles.chipText}>
                  Any
                </Text>
              </Pressable>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => setCategoryId(category.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: categoryId === category.id }}
                  accessibilityLabel={category.name}
                  style={[styles.chip, categoryId === category.id ? styles.chipActive : null]}
                >
                  <Text
                    style={categoryId === category.id ? styles.chipTextActive : styles.chipText}
                  >
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <TextField
                  label="Min budget (PHP)"
                  value={minBudget}
                  onChangeText={setMinBudget}
                  keyboardType="numeric"
                  error={errors.minBudget}
                />
              </View>
              <View style={styles.rowItem}>
                <TextField
                  label="Max budget (PHP)"
                  value={maxBudget}
                  onChangeText={setMaxBudget}
                  keyboardType="numeric"
                  error={errors.maxBudget}
                />
              </View>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.sectionLabel}>Same-day tasks only</Text>
              <Switch
                value={sameDayOnly}
                onValueChange={setSameDayOnly}
                accessibilityLabel="Same-day tasks only"
                accessibilityRole="switch"
              />
            </View>

            <Text style={styles.sectionLabel}>Scheduled window</Text>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <TextField
                  label="From (YYYY-MM-DD)"
                  value={scheduledFrom}
                  onChangeText={setScheduledFrom}
                  placeholder="2026-07-25"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errors.scheduledFrom}
                />
              </View>
              <View style={styles.rowItem}>
                <TextField
                  label="To (YYYY-MM-DD)"
                  value={scheduledTo}
                  onChangeText={setScheduledTo}
                  placeholder="2026-07-28"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errors.scheduledTo}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>Area</Text>
            <View style={styles.chipRow} accessibilityRole="radiogroup">
              <Pressable
                onPress={() => setAreaId(undefined)}
                accessibilityRole="radio"
                accessibilityState={{ checked: areaId === undefined }}
                accessibilityLabel="Any area"
                style={[styles.chip, areaId === undefined ? styles.chipActive : null]}
              >
                <Text style={areaId === undefined ? styles.chipTextActive : styles.chipText}>
                  Any
                </Text>
              </Pressable>
              {DEV_REFERENCE_AREAS.map((area) => (
                <Pressable
                  key={area.id}
                  onPress={() => (distanceAvailable ? setAreaId(area.id) : undefined)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: areaId === area.id, disabled: !distanceAvailable }}
                  accessibilityLabel={area.label}
                  style={[
                    styles.chip,
                    areaId === area.id ? styles.chipActive : null,
                    !distanceAvailable ? styles.chipDisabled : null,
                  ]}
                >
                  <Text style={areaId === area.id ? styles.chipTextActive : styles.chipText}>
                    {area.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {!distanceAvailable ? (
              <Text style={styles.helperText}>
                No map provider is configured, so area/distance filtering is unavailable.
              </Text>
            ) : (
              <Text style={styles.helperText}>
                Areas are approximate public reference points, not your exact location.
              </Text>
            )}

            <TextField
              label={
                distanceAvailable && areaId ? "Within distance (km)" : "Distance filter unavailable"
              }
              value={radiusKm}
              onChangeText={setRadiusKm}
              keyboardType="numeric"
              editable={distanceAvailable && Boolean(areaId)}
              error={errors.radiusKm}
              description={
                distanceAvailable
                  ? areaId
                    ? "Approximate area, not exact GPS distance."
                    : "Select an area above to enable a distance radius."
                  : "No map provider is configured, so distance filtering is unavailable."
              }
            />

            <Text style={styles.sectionLabel}>Sort by</Text>
            <View style={styles.chipRow} accessibilityRole="radiogroup">
              {SORT_OPTIONS.map((option) => {
                const disabled = option.key === "nearby" && !(distanceAvailable && areaId);
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => !disabled && setSort(option.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: sort === option.key, disabled }}
                    accessibilityLabel={option.label}
                    style={[
                      styles.chip,
                      sort === option.key ? styles.chipActive : null,
                      disabled ? styles.chipDisabled : null,
                    ]}
                  >
                    <Text style={sort === option.key ? styles.chipTextActive : styles.chipText}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <Button label="Clear all" onPress={handleClear} variant="secondary" />
            <Button label="Apply filters" onPress={handleApply} fullWidth />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: theme.textPrimary },
  closeButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  closeLabel: { color: theme.primary, fontWeight: "600", fontSize: fontSize.md },
  body: { padding: spacing.lg, gap: spacing.md },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: "700", color: theme.textPrimary },
  helperText: { fontSize: fontSize.xs, color: theme.textSecondary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: theme.textSecondary, fontSize: fontSize.sm, fontWeight: "600" },
  chipTextActive: { color: theme.onPrimary, fontSize: fontSize.sm, fontWeight: "600" },
  row: { flexDirection: "row", gap: spacing.md },
  rowItem: { flex: 1 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
});
