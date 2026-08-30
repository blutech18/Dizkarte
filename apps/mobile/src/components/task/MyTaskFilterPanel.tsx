import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useCategories } from "../../providers/CategoriesProvider";
import { BottomSheetModal } from "../ui/BottomSheetModal";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import {
  DateFilterField,
  FilterChoice,
  FilterCountChoice,
  FilterHint,
  FilterSectionAction,
  FilterSectionHeader,
  FilterSheetHeader,
  FilterSwitchRow,
  filterSheetStyles as sheet,
  formatDateOnly,
  parseDateOnly,
} from "../ui/FilterSheetParts";
import { LocalityPicker, type LocalityValue } from "./LocalityPicker";
import { CalendarPickerModal } from "./TaskSchedulePicker";
import { dateOnlyToIso, isoToDateOnly, validateTaskFilterDraft } from "./taskFilterQuery";
import {
  DEFAULT_MY_TASK_FILTERS,
  MY_TASK_SORT_OPTIONS,
  MY_TASK_STATUS_FILTERS,
  type MyTaskFilterState,
  type MyTaskSort,
  type MyTaskStatusFilter,
} from "./myTaskFilters";

export type MyTaskFilterPanelProps = {
  readonly visible: boolean;
  readonly filters: MyTaskFilterState;
  /** Count each status option would reveal, given the other applied filters. */
  readonly counts: Readonly<Record<MyTaskStatusFilter, number>>;
  /** Count each category option would reveal, given the other applied filters. */
  readonly categoryCounts?: Readonly<Record<string, number>> & { readonly all: number };
  /** Total matching the whole draft, for the apply button. */
  readonly matchingCount: number;
  readonly onApply: (next: MyTaskFilterState) => void;
  /** Called on every draft edit so the parent can recount without applying. */
  readonly onDraftChange: (draft: MyTaskFilterState) => void;
  readonly onClose: () => void;
};

type DateField = "from" | "to";

/**
 * Full filter sheet for the Client's own tasks.
 *
 * Mirrors the discovery sheet's structure and validation so the two feel like
 * one product, but every control is backed by a field on the owned-task record
 * rather than by the public search contract.
 */
export function MyTaskFilterPanel({
  visible,
  filters,
  counts,
  categoryCounts,
  matchingCount,
  onApply,
  onDraftChange,
  onClose,
}: MyTaskFilterPanelProps) {
  const { categories } = useCategories();
  const [status, setStatus] = useState<MyTaskStatusFilter>(filters.status);
  const [categoryId, setCategoryId] = useState<string | undefined>(filters.categoryId);
  const [minBudget, setMinBudget] = useState(
    typeof filters.minBudgetCentavos === "number" ? String(filters.minBudgetCentavos / 100) : "",
  );
  const [maxBudget, setMaxBudget] = useState(
    typeof filters.maxBudgetCentavos === "number" ? String(filters.maxBudgetCentavos / 100) : "",
  );
  const [sameDayOnly, setSameDayOnly] = useState(filters.sameDayOnly ?? false);
  const [withOffersOnly, setWithOffersOnly] = useState(filters.withOffersOnly ?? false);
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
  const [sort, setSort] = useState<MyTaskSort>(filters.sort);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // A closed sheet is a cancelled draft: rehydrate from the applied filters on
  // every open so abandoned edits never leak into the next session.
  useEffect(() => {
    if (!visible) return;
    setStatus(filters.status);
    setCategoryId(filters.categoryId);
    setMinBudget(
      typeof filters.minBudgetCentavos === "number" ? String(filters.minBudgetCentavos / 100) : "",
    );
    setMaxBudget(
      typeof filters.maxBudgetCentavos === "number" ? String(filters.maxBudgetCentavos / 100) : "",
    );
    setSameDayOnly(filters.sameDayOnly ?? false);
    setWithOffersOnly(filters.withOffersOnly ?? false);
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
    setSort(filters.sort);
    setErrors({});
  }, [filters, visible]);

  /** The draft as a value, so the count effect depends on data, not a callback. */
  const draft = useMemo<MyTaskFilterState>(() => {
    const minCentavos = minBudget.trim() ? Math.round(Number(minBudget) * 100) : undefined;
    const maxCentavos = maxBudget.trim() ? Math.round(Number(maxBudget) * 100) : undefined;
    const fromIso = dateOnlyToIso(scheduledFrom, false);
    const toIso = dateOnlyToIso(scheduledTo, true);
    return {
      status,
      sort,
      ...(categoryId ? { categoryId } : {}),
      ...(Number.isFinite(minCentavos) ? { minBudgetCentavos: minCentavos as number } : {}),
      ...(Number.isFinite(maxCentavos) ? { maxBudgetCentavos: maxCentavos as number } : {}),
      ...(sameDayOnly ? { sameDayOnly: true } : {}),
      ...(withOffersOnly ? { withOffersOnly: true } : {}),
      ...(fromIso ? { scheduledFrom: fromIso } : {}),
      ...(toIso ? { scheduledTo: toIso } : {}),
      ...(locality.cityCode ? { cityCode: locality.cityCode } : {}),
      ...(locality.cityName ? { cityName: locality.cityName } : {}),
      ...(locality.barangayCode ? { barangayCode: locality.barangayCode } : {}),
      ...(locality.barangayName ? { barangayName: locality.barangayName } : {}),
    };
  }, [
    status,
    categoryId,
    minBudget,
    maxBudget,
    sameDayOnly,
    withOffersOnly,
    scheduledFrom,
    scheduledTo,
    locality,
    sort,
  ]);

  // Keep the parent's counts in step with the draft the user is editing.
  useEffect(() => {
    if (!visible) return;
    onDraftChange(draft);
  }, [draft, onDraftChange, visible]);

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
    onApply(draft);
  }

  function handleClear() {
    setStatus("all");
    setCategoryId(undefined);
    setMinBudget("");
    setMaxBudget("");
    setSameDayOnly(false);
    setWithOffersOnly(false);
    setScheduledFrom("");
    setScheduledTo("");
    setActiveDateField(null);
    setLocality({ cityCode: null, barangayCode: null, cityName: null, barangayName: null });
    setSort("recent");
    setErrors({});
    onApply(DEFAULT_MY_TASK_FILTERS);
  }

  function closePanel() {
    setActiveDateField(null);
    onClose();
  }

  const hasScheduleFilter =
    sameDayOnly || Boolean(scheduledFrom) || Boolean(scheduledTo) || withOffersOnly;

  return (
    <>
      <BottomSheetModal visible={visible} onClose={closePanel}>
        <FilterSheetHeader
          title="Filter tasks"
          description="Narrow your tasks by status, category, location, schedule, or budget."
          onClose={closePanel}
          closeAccessibilityLabel="Close task filters"
        />

        <ScrollView
          style={sheet.scroll}
          contentContainerStyle={sheet.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={sheet.section}>
            <FilterSectionHeader
              title="Status"
              description="Choose which stage of your tasks you want to see."
            />
            <View style={sheet.choiceGrid} accessibilityRole="radiogroup">
              {MY_TASK_STATUS_FILTERS.map((item) => (
                <FilterCountChoice
                  key={item.key}
                  label={item.label}
                  count={counts[item.key]}
                  unit="task"
                  icon={item.icon}
                  selected={status === item.key}
                  onPress={() => setStatus(item.key)}
                />
              ))}
            </View>
          </View>

          <View style={sheet.section}>
            <FilterSectionHeader
              title="Category"
              description="Show only one type of work you posted."
            />
            <View style={sheet.choiceGroups} accessibilityRole="radiogroup">
              <View style={sheet.choiceGrid}>
                <FilterCountChoice
                  label="All categories"
                  count={categoryCounts?.all ?? matchingCount}
                  unit="task"
                  selected={categoryId === undefined}
                  onPress={() => setCategoryId(undefined)}
                />
              </View>
              <View style={sheet.choiceGrid}>
                {categories.map((category) => (
                  <FilterCountChoice
                    key={category.id}
                    label={category.name}
                    count={categoryCounts?.[category.id] ?? 0}
                    unit="task"
                    selected={categoryId === category.id}
                    onPress={() => setCategoryId(category.id)}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={sheet.section}>
            <FilterSectionHeader
              title="Location"
              description="Filter by the city or municipality you posted the task in."
              {...(locality.cityCode
                ? {
                    action: (
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
                    ),
                  }
                : {})}
            />
            <LocalityPicker
              value={locality}
              onChange={setLocality}
              cityLabel="City / Municipality"
              barangayLabel="Barangay (optional)"
              responsive
            />
            <FilterHint text="Locations use canonical PSGC codes and never expose an exact task address." />
          </View>

          <View style={sheet.section}>
            <FilterSectionHeader
              title="Schedule & offers"
              description="Filter by when the work is needed, or surface tasks waiting on your decision."
              {...(hasScheduleFilter
                ? {
                    action: (
                      <FilterSectionAction
                        label="Reset"
                        accessibilityLabel="Reset schedule and offer filters"
                        onPress={() => {
                          setSameDayOnly(false);
                          setWithOffersOnly(false);
                          setScheduledFrom("");
                          setScheduledTo("");
                          setActiveDateField(null);
                          clearError("scheduledFrom");
                          clearError("scheduledTo");
                        }}
                      />
                    ),
                  }
                : {})}
            />

            <View style={sheet.fieldGrid}>
              <View style={sheet.fieldColumn}>
                <FilterSwitchRow
                  title="Needed today"
                  value={sameDayOnly}
                  onValueChange={setSameDayOnly}
                />
              </View>
              <View style={sheet.fieldColumn}>
                <FilterSwitchRow
                  title="Has offers"
                  value={withOffersOnly}
                  onValueChange={setWithOffersOnly}
                />
              </View>
            </View>

            <View style={sheet.fieldGrid}>
              <View style={sheet.fieldColumn}>
                <DateFilterField
                  label="Scheduled from"
                  value={scheduledFrom}
                  emptyLabel="Any start date"
                  error={errors.scheduledFrom}
                  onPress={() => openDatePicker("from")}
                />
              </View>
              <View style={sheet.fieldColumn}>
                <DateFilterField
                  label="Scheduled to"
                  value={scheduledTo}
                  emptyLabel="Any end date"
                  error={errors.scheduledTo}
                  onPress={() => openDatePicker("to")}
                />
              </View>
            </View>
          </View>

          <View style={sheet.section}>
            <FilterSectionHeader
              title="Budget"
              description="Set an optional range in Philippine pesos."
            />
            <View style={sheet.fieldGrid}>
              <View style={sheet.fieldColumn}>
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
                  containerStyle={sheet.filterField}
                />
              </View>
              <View style={sheet.fieldColumn}>
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
                  containerStyle={sheet.filterField}
                />
              </View>
            </View>
          </View>

          <View style={[sheet.section, sheet.lastSection]}>
            <FilterSectionHeader
              title="Sort"
              description="Choose which tasks appear first."
            />
            <View style={sheet.choiceGrid} accessibilityRole="radiogroup">
              {MY_TASK_SORT_OPTIONS.map((option) => (
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

        <View style={sheet.footer}>
          <View style={sheet.footerActionSecondary}>
            <Button label="Clear all" variant="secondary" onPress={handleClear} fullWidth />
          </View>
          <View style={sheet.footerActionPrimary}>
            <Button
              label={`Show ${matchingCount} task${matchingCount === 1 ? "" : "s"}`}
              onPress={handleApply}
              fullWidth
            />
          </View>
        </View>
      </BottomSheetModal>

      <CalendarPickerModal
        visible={visible && activeDateField !== null}
        selectedDate={calendarDate}
        title={activeDateField === "from" ? "Select start date" : "Select end date"}
        confirmLabel={activeDateField === "from" ? "Use as start date" : "Use as end date"}
        onConfirm={handleDateConfirm}
        onClose={() => setActiveDateField(null)}
      />
    </>
  );
}
