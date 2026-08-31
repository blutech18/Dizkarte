import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCategories } from "../../providers/CategoriesProvider";
import { theme, spacing, fontSize, lineHeight, radii, MIN_TOUCH_TARGET } from "../../theme";
import { Button } from "../ui/Button";
import { BottomSheetModal } from "../ui/BottomSheetModal";
import { TextField } from "../ui/TextField";
import {
  DateFilterField,
  FilterChoice,
  FilterSectionAction,
  FilterSectionHeader,
  FilterHint,
  FilterSwitchRow,
  formatDateOnly,
  parseDateOnly,
} from "../ui/FilterSheetParts";
import { LocalityPicker, type LocalityValue } from "./LocalityPicker";
import { CalendarPickerModal } from "./TaskSchedulePicker";
import {
  DEFAULT_TASK_FILTERS,
  SORT_OPTIONS,
  dateOnlyToIso,
  describeActiveFilters as describeActiveFiltersRaw,
  isoToDateOnly,
  validateTaskFilterDraft,
  type TaskFeedSort,
  type TaskFilterState,
} from "./taskFilterQuery";

export {
  buildTaskSearchQuery,
  DEFAULT_TASK_FILTERS,
  validateTaskFilterDraft,
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
};

type DateField = "from" | "to";

/** Modal filter/sort form validated against the shared discovery bounds contract. */
export function TaskFilterPanel({ visible, filters, onApply, onClose }: TaskFilterPanelProps) {
  const { categories } = useCategories();
  const [categoryId, setCategoryId] = useState<string | undefined>(filters.categoryId);
  const [minBudget, setMinBudget] = useState(
    filters.minBudgetCentavos ? String(filters.minBudgetCentavos / 100) : "",
  );
  const [maxBudget, setMaxBudget] = useState(
    filters.maxBudgetCentavos ? String(filters.maxBudgetCentavos / 100) : "",
  );
  const [sameDayOnly, setSameDayOnly] = useState(filters.sameDayOnly ?? false);
  const [noOffersOnly, setNoOffersOnly] = useState(filters.noOffersOnly ?? false);
  const [scheduledFrom, setScheduledFrom] = useState(isoToDateOnly(filters.scheduledFrom));
  const [scheduledTo, setScheduledTo] = useState(isoToDateOnly(filters.scheduledTo));
  const [activeDateField, setActiveDateField] = useState<DateField | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [locality, setLocality] = useState<LocalityValue>({
    cityCode: filters.cityCode ?? null,
    barangayCode: filters.barangayCode ?? null,
    cityName: filters.cityName ?? null,
    barangayName: filters.barangayName ?? null,
  });
  const [sort, setSort] = useState<TaskFeedSort>(
    filters.sort === "nearby" ? "newest" : filters.sort,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // A closed sheet is a canceled draft. Rehydrate every field from the applied
  // filters whenever it opens so abandoned edits never leak into the next open.
  useEffect(() => {
    if (!visible) return;
    setCategoryId(filters.categoryId);
    setMinBudget(
      typeof filters.minBudgetCentavos === "number" ? String(filters.minBudgetCentavos / 100) : "",
    );
    setMaxBudget(
      typeof filters.maxBudgetCentavos === "number" ? String(filters.maxBudgetCentavos / 100) : "",
    );
    setSameDayOnly(filters.sameDayOnly ?? false);
    setNoOffersOnly(filters.noOffersOnly ?? false);
    setScheduledFrom(isoToDateOnly(filters.scheduledFrom));
    setScheduledTo(isoToDateOnly(filters.scheduledTo));
    setActiveDateField(null);
    setCalendarDate(new Date());
    setLocality({
      cityCode: filters.cityCode ?? null,
      barangayCode: filters.barangayCode ?? null,
      cityName: filters.cityName ?? null,
      barangayName: filters.barangayName ?? null,
    });
    setSort(filters.sort === "nearby" ? "newest" : filters.sort);
    setErrors({});
  }, [filters, visible]);

  function clearError(field: string) {
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function openDatePicker(field: DateField) {
    const value = field === "from" ? scheduledFrom : scheduledTo;
    setCalendarDate(parseDateOnly(value) ?? new Date());
    setActiveDateField(field);
  }

  function handleDateConfirm(date: Date) {
    if (!activeDateField) return;
    const value = formatDateOnly(date);
    if (activeDateField === "from") {
      setScheduledFrom(value);
      clearError("scheduledFrom");
    } else {
      setScheduledTo(value);
      clearError("scheduledTo");
    }
    setCalendarDate(date);
    setActiveDateField(null);
  }

  function resetSchedule() {
    setSameDayOnly(false);
    setNoOffersOnly(false);
    setScheduledFrom("");
    setScheduledTo("");
    setActiveDateField(null);
    setErrors((current) => {
      const next = { ...current };
      delete next.scheduledFrom;
      delete next.scheduledTo;
      return next;
    });
  }

  function handleApply() {
    const validation = validateTaskFilterDraft({
      minBudget,
      maxBudget,
      scheduledFrom,
      scheduledTo,
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
    const resolvedSort = sort === "nearby" ? "newest" : sort;
    onApply({
      sort: resolvedSort,
      ...(categoryId ? { categoryId } : {}),
      ...(typeof minCentavos === "number" ? { minBudgetCentavos: minCentavos } : {}),
      ...(typeof maxCentavos === "number" ? { maxBudgetCentavos: maxCentavos } : {}),
      ...(sameDayOnly ? { sameDayOnly: true } : {}),
      ...(noOffersOnly ? { noOffersOnly: true } : {}),
      ...(fromIso ? { scheduledFrom: fromIso } : {}),
      ...(toIso ? { scheduledTo: toIso } : {}),
      ...(locality.cityCode ? { cityCode: locality.cityCode } : {}),
      ...(locality.cityName ? { cityName: locality.cityName } : {}),
      ...(locality.barangayCode ? { barangayCode: locality.barangayCode } : {}),
      ...(locality.barangayName ? { barangayName: locality.barangayName } : {}),
    });
  }

  function handleClear() {
    setCategoryId(undefined);
    setMinBudget("");
    setMaxBudget("");
    setSameDayOnly(false);
    setNoOffersOnly(false);
    setScheduledFrom("");
    setScheduledTo("");
    setActiveDateField(null);
    setLocality({ cityCode: null, barangayCode: null, cityName: null, barangayName: null });
    setSort("newest");
    setErrors({});
    onApply(DEFAULT_TASK_FILTERS);
  }

  function closePanel() {
    setActiveDateField(null);
    onClose();
  }

  const hasScheduleFilter =
    sameDayOnly || noOffersOnly || Boolean(scheduledFrom) || Boolean(scheduledTo);

  return (
    <>
      <BottomSheetModal visible={visible} onClose={closePanel}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title} accessibilityRole="header">
              Filter & sort
            </Text>
            <Text style={styles.headerDescription}>Refine the tasks shown in your results.</Text>
          </View>
          <Pressable
            onPress={closePanel}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? styles.closeButtonPressed : null,
            ]}
          >
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.section}>
            <FilterSectionHeader
              title="Category"
              description="Choose the type of work you want to see."
            />
            <View style={styles.categoryChoiceGroups} accessibilityRole="radiogroup">
              <View style={styles.choiceGrid}>
                <FilterChoice
                  label="All categories"
                  selected={categoryId === undefined}
                  onPress={() => setCategoryId(undefined)}
                />
              </View>
              <View style={styles.choiceGrid}>
                {categories.map((category) => (
                  <FilterChoice
                    key={category.id}
                    label={category.name}
                    selected={categoryId === category.id}
                    onPress={() => setCategoryId(category.id)}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <FilterSectionHeader
              title="Budget"
              description="Set an optional price range in Philippine pesos."
            />
            <View style={styles.fieldGrid}>
              <View style={styles.fieldColumn}>
                <TextField
                  label="Minimum"
                  value={minBudget}
                  onChangeText={(value) => {
                    setMinBudget(value);
                    clearError("minBudget");
                  }}
                  placeholder="No minimum"
                  keyboardType="numeric"
                  inputMode="decimal"
                  error={errors.minBudget}
                  containerStyle={styles.filterField}
                />
              </View>
              <View style={styles.fieldColumn}>
                <TextField
                  label="Maximum"
                  value={maxBudget}
                  onChangeText={(value) => {
                    setMaxBudget(value);
                    clearError("maxBudget");
                  }}
                  placeholder="No maximum"
                  keyboardType="numeric"
                  inputMode="decimal"
                  error={errors.maxBudget}
                  containerStyle={styles.filterField}
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <FilterSectionHeader
              title="Schedule"
              description="Use the calendar for a date range, or only show tasks needed today."
              action={
                hasScheduleFilter ? (
                  <FilterSectionAction
                    label="Reset"
                    accessibilityLabel="Reset schedule filters"
                    onPress={resetSchedule}
                  />
                ) : null
              }
            />

            <View style={styles.fieldGrid}>
              <View style={styles.fieldColumn}>
                <FilterSwitchRow
                  title="Needed today"
                  value={sameDayOnly}
                  onValueChange={setSameDayOnly}
                />
              </View>
              <View style={styles.fieldColumn}>
                <FilterSwitchRow
                  title="No offers yet"
                  value={noOffersOnly}
                  onValueChange={setNoOffersOnly}
                />
              </View>
            </View>

            <View style={styles.fieldGrid}>
              <View style={styles.fieldColumn}>
                <DateFilterField
                  label="From date"
                  value={scheduledFrom}
                  emptyLabel="Any start date"
                  error={errors.scheduledFrom}
                  onPress={() => openDatePicker("from")}
                />
              </View>
              <View style={styles.fieldColumn}>
                <DateFilterField
                  label="To date"
                  value={scheduledTo}
                  emptyLabel="Any end date"
                  error={errors.scheduledTo}
                  onPress={() => openDatePicker("to")}
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <FilterSectionHeader
              title="Location"
              description="Search the official PSGC directory by city or municipality, then optionally narrow to a barangay."
              action={
                locality.cityCode ? (
                  <FilterSectionAction
                    label="Clear"
                    accessibilityLabel="Clear location filters"
                    onPress={() =>
                      setLocality({
                        cityCode: null,
                        barangayCode: null,
                        cityName: null,
                        barangayName: null,
                      })
                    }
                  />
                ) : null
              }
            />

            <LocalityPicker
              value={locality}
              onChange={setLocality}
              cityLabel="City / Municipality"
              barangayLabel="Barangay (optional)"
              responsive
            />

            <FilterHint text="Results use canonical PSGC codes and never expose an exact task address." />
          </View>

          <View style={[styles.section, styles.lastSection]}>
            <FilterSectionHeader
              title="Sort results"
              description="Choose which tasks should appear first."
            />
            <View style={styles.choiceGrid} accessibilityRole="radiogroup">
              {SORT_OPTIONS.map((option) => (
                <FilterChoice
                  key={option.key}
                  label={option.label}
                  selected={sort === option.key}
                  onPress={() => setSort(option.key)}
                />
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerClearAction}>
            <Button label="Clear all" onPress={handleClear} variant="secondary" fullWidth />
          </View>
          <View style={styles.footerApplyAction}>
            <Button label="Apply filters" onPress={handleApply} fullWidth />
          </View>
        </View>

        <CalendarPickerModal
          visible={activeDateField !== null}
          useModal={false}
          selectedDate={calendarDate}
          title={activeDateField === "from" ? "Select start date" : "Select end date"}
          confirmLabel={activeDateField === "from" ? "Use as start date" : "Use as end date"}
          onConfirm={handleDateConfirm}
          onClose={() => setActiveDateField(null)}
        />
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { fontSize: fontSize.lg, fontWeight: "800", color: theme.textPrimary },
  headerDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  closeButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
  },
  closeButtonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  closeLabel: { color: theme.primary, fontWeight: "700", fontSize: fontSize.sm },
  scroll: { flexShrink: 1 },
  body: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  lastSection: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  sectionHeaderCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  sectionDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  sectionAction: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  sectionActionPressed: {
    backgroundColor: theme.surfaceSubtle,
  },
  sectionActionText: {
    color: theme.primary,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  categoryChoiceGroups: { gap: spacing.sm },
  choiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  choice: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "47%",
    minWidth: 0,
    height: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
  },
  choiceText: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "700",
    textAlign: "center",
  },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  fieldColumn: { flexGrow: 1, flexShrink: 1, flexBasis: 260, minWidth: 0 },
  // Cancels TextField's own bottom margin: the grid gap and the section's
  // padding already space these inputs, exactly as in the My Tasks and Bookings
  // sheets, which zero it through the shared filter-sheet styles.
  filterField: { marginBottom: 0 },
  switchRow: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  controlTitle: { fontSize: fontSize.md, fontWeight: "600", color: theme.textPrimary },
  dateField: { gap: spacing.xs },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: "700", color: theme.textPrimary },
  dateButton: {
    height: 48,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
  },
  dateButtonError: { borderColor: theme.errorSolid },
  dateButtonPressed: { borderColor: theme.primary, backgroundColor: theme.surfaceSubtle },
  dateButtonContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dateButtonText: { flex: 1, color: theme.textSecondary, fontSize: fontSize.md },
  dateButtonTextSelected: { color: theme.textPrimary, fontWeight: "600" },
  fieldError: {
    marginTop: spacing.xs,
    color: theme.errorOnSoft,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  inlineHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.infoSoft,
  },
  inlineHintText: {
    flex: 1,
    color: theme.infoOnSoft,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  unavailableNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
  },
  unavailableNoticeText: {
    flex: 1,
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  helperText: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    backgroundColor: theme.surface,
  },
  footerClearAction: { width: 128, flexShrink: 0 },
  footerApplyAction: { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 },
});

