import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { BottomSheetModal } from "../ui/BottomSheetModal";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import {
  DateFilterField,
  FilterChoice,
  FilterCountChoice,
  FilterSectionAction,
  FilterSectionHeader,
  FilterSheetHeader,
  FilterSwitchRow,
  filterSheetStyles as sheet,
  formatDateOnly,
  parseDateOnly,
} from "../ui/FilterSheetParts";
import { CalendarPickerModal } from "../task/TaskSchedulePicker";
import { dateOnlyToIso, isoToDateOnly, validateTaskFilterDraft } from "../task/taskFilterQuery";
import {
  BOOKING_FILTERS,
  BOOKING_ROLE_OPTIONS,
  BOOKING_SORT_OPTIONS,
  DEFAULT_BOOKING_FILTERS,
  type BookingFilterKey,
  type BookingFilterState,
  type BookingRoleFilter,
  type BookingSort,
} from "./bookingFilters";

export type BookingFilterPanelProps = {
  readonly visible: boolean;
  readonly filters: BookingFilterState;
  readonly counts: Readonly<Record<BookingFilterKey, number>>;
  readonly matchingCount: number;
  readonly onApply: (next: BookingFilterState) => void;
  readonly onDraftChange: (draft: BookingFilterState) => void;
  readonly onClose: () => void;
};

type DateField = "from" | "to";

/**
 * Full filter sheet for the booking list.
 *
 * Same structure as the My Tasks sheet. The role filter matters here because a
 * single account is both Client and Tasker, so "bookings" mixes work you hired
 * for with work you did.
 */
export function BookingFilterPanel({
  visible,
  filters,
  counts,
  matchingCount,
  onApply,
  onDraftChange,
  onClose,
}: BookingFilterPanelProps) {
  const [stage, setStage] = useState<BookingFilterKey>(filters.stage);
  const [role, setRole] = useState<BookingRoleFilter>(filters.role);
  const [minAmount, setMinAmount] = useState(
    typeof filters.minAmountCentavos === "number" ? String(filters.minAmountCentavos / 100) : "",
  );
  const [maxAmount, setMaxAmount] = useState(
    typeof filters.maxAmountCentavos === "number" ? String(filters.maxAmountCentavos / 100) : "",
  );
  const [bookedFrom, setBookedFrom] = useState(isoToDateOnly(filters.bookedFrom));
  const [bookedTo, setBookedTo] = useState(isoToDateOnly(filters.bookedTo));
  const [unreadOnly, setUnreadOnly] = useState(filters.unreadOnly ?? false);
  const [activeDateField, setActiveDateField] = useState<DateField | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [sort, setSort] = useState<BookingSort>(filters.sort);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    setStage(filters.stage);
    setRole(filters.role);
    setMinAmount(
      typeof filters.minAmountCentavos === "number" ? String(filters.minAmountCentavos / 100) : "",
    );
    setMaxAmount(
      typeof filters.maxAmountCentavos === "number" ? String(filters.maxAmountCentavos / 100) : "",
    );
    setBookedFrom(isoToDateOnly(filters.bookedFrom));
    setBookedTo(isoToDateOnly(filters.bookedTo));
    setUnreadOnly(filters.unreadOnly ?? false);
    setActiveDateField(null);
    setCalendarDate(new Date());
    setSort(filters.sort);
    setErrors({});
  }, [filters, visible]);

  const draft = useMemo<BookingFilterState>(() => {
    const minCentavos = minAmount.trim() ? Math.round(Number(minAmount) * 100) : undefined;
    const maxCentavos = maxAmount.trim() ? Math.round(Number(maxAmount) * 100) : undefined;
    const fromIso = dateOnlyToIso(bookedFrom, false);
    const toIso = dateOnlyToIso(bookedTo, true);
    return {
      stage,
      role,
      sort,
      ...(Number.isFinite(minCentavos) ? { minAmountCentavos: minCentavos as number } : {}),
      ...(Number.isFinite(maxCentavos) ? { maxAmountCentavos: maxCentavos as number } : {}),
      ...(fromIso ? { bookedFrom: fromIso } : {}),
      ...(toIso ? { bookedTo: toIso } : {}),
      ...(unreadOnly ? { unreadOnly: true } : {}),
    };
  }, [stage, role, minAmount, maxAmount, bookedFrom, bookedTo, unreadOnly, sort]);

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
    const value = field === "from" ? bookedFrom : bookedTo;
    setCalendarDate(parseDateOnly(value) ?? new Date());
    setActiveDateField(field);
  }

  function handleDateConfirm(date: Date) {
    if (!activeDateField) return;
    const value = formatDateOnly(date);
    if (activeDateField === "from") {
      setBookedFrom(value);
      clearError("scheduledFrom");
    } else {
      setBookedTo(value);
      clearError("scheduledTo");
    }
    setCalendarDate(date);
    setActiveDateField(null);
  }

  function handleApply() {
    // Reuses the shared bounds contract: the field names differ in the UI but
    // the money/date rules a filter must satisfy are the same.
    const validation = validateTaskFilterDraft({
      minBudget: minAmount,
      maxBudget: maxAmount,
      scheduledFrom: bookedFrom,
      scheduledTo: bookedTo,
    });
    if (!validation.ok) {
      const mapped: Record<string, string> = {};
      if (validation.errors.minBudget) mapped.minAmount = validation.errors.minBudget;
      if (validation.errors.maxBudget) mapped.maxAmount = validation.errors.maxBudget;
      if (validation.errors.scheduledFrom) mapped.bookedFrom = validation.errors.scheduledFrom;
      if (validation.errors.scheduledTo) mapped.bookedTo = validation.errors.scheduledTo;
      setErrors(mapped);
      return;
    }
    setErrors({});
    onApply(draft);
  }

  function handleClear() {
    setStage("all");
    setRole("any");
    setMinAmount("");
    setMaxAmount("");
    setBookedFrom("");
    setBookedTo("");
    setUnreadOnly(false);
    setActiveDateField(null);
    setSort("recent");
    setErrors({});
    onApply(DEFAULT_BOOKING_FILTERS);
  }

  function closePanel() {
    setActiveDateField(null);
    onClose();
  }

  const hasDateFilter = Boolean(bookedFrom) || Boolean(bookedTo) || unreadOnly;

  return (
    <>
      <BottomSheetModal visible={visible} onClose={closePanel}>
        <FilterSheetHeader
          title="Filter bookings"
          description="Narrow by stage, your role, when it was booked, or amount."
          onClose={closePanel}
          closeAccessibilityLabel="Close booking filters"
        />

        <ScrollView
          style={sheet.scroll}
          contentContainerStyle={sheet.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={sheet.section}>
            <FilterSectionHeader
              title="Stage"
              description="Choose which booking stage you want to see."
            />
            <View style={sheet.choiceGrid} accessibilityRole="radiogroup">
              {BOOKING_FILTERS.map((item) => (
                <FilterCountChoice
                  key={item.key}
                  label={item.label}
                  count={counts[item.key]}
                  unit="booking"
                  icon={item.icon}
                  selected={stage === item.key}
                  onPress={() => setStage(item.key)}
                />
              ))}
            </View>
          </View>

          <View style={sheet.section}>
            <FilterSectionHeader
              title="Your role"
              description="Separate the work you hired for from the work you did."
            />
            <View style={sheet.choiceGrid} accessibilityRole="radiogroup">
              {BOOKING_ROLE_OPTIONS.map((option) => (
                <FilterChoice
                  key={option.key}
                  label={option.label}
                  selected={role === option.key}
                  onPress={() => setRole(option.key)}
                />
              ))}
            </View>
          </View>

          <View style={sheet.section}>
            <FilterSectionHeader
              title="Booked date & messages"
              description="Filter by when the booking was created, or only what needs reading."
              {...(hasDateFilter
                ? {
                    action: (
                      <FilterSectionAction
                        label="Reset"
                        accessibilityLabel="Reset date and message filters"
                        onPress={() => {
                          setBookedFrom("");
                          setBookedTo("");
                          setUnreadOnly(false);
                          setActiveDateField(null);
                          clearError("bookedFrom");
                          clearError("bookedTo");
                        }}
                      />
                    ),
                  }
                : {})}
            />

            <FilterSwitchRow
              title="Unread messages only"
              value={unreadOnly}
              onValueChange={setUnreadOnly}
            />

            <View style={sheet.fieldGrid}>
              <View style={sheet.fieldColumn}>
                <DateFilterField
                  label="Booked from"
                  value={bookedFrom}
                  emptyLabel="Any start date"
                  error={errors.bookedFrom}
                  onPress={() => openDatePicker("from")}
                />
              </View>
              <View style={sheet.fieldColumn}>
                <DateFilterField
                  label="Booked to"
                  value={bookedTo}
                  emptyLabel="Any end date"
                  error={errors.bookedTo}
                  onPress={() => openDatePicker("to")}
                />
              </View>
            </View>
          </View>

          <View style={sheet.section}>
            <FilterSectionHeader
              title="Amount"
              description="Set an optional agreed-price range in Philippine pesos."
            />
            <View style={sheet.fieldGrid}>
              <View style={sheet.fieldColumn}>
                <TextField
                  label="Minimum"
                  value={minAmount}
                  onChangeText={(value) => {
                    setMinAmount(value);
                    clearError("minAmount");
                  }}
                  placeholder="No minimum"
                  keyboardType="numeric"
                  inputMode="decimal"
                  error={errors.minAmount}
                  containerStyle={sheet.filterField}
                />
              </View>
              <View style={sheet.fieldColumn}>
                <TextField
                  label="Maximum"
                  value={maxAmount}
                  onChangeText={(value) => {
                    setMaxAmount(value);
                    clearError("maxAmount");
                  }}
                  placeholder="No maximum"
                  keyboardType="numeric"
                  inputMode="decimal"
                  error={errors.maxAmount}
                  containerStyle={sheet.filterField}
                />
              </View>
            </View>
          </View>

          <View style={[sheet.section, sheet.lastSection]}>
            <FilterSectionHeader
              title="Sort"
              description="Choose which bookings appear first."
            />
            <View style={sheet.choiceGrid} accessibilityRole="radiogroup">
              {BOOKING_SORT_OPTIONS.map((option) => (
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
              label={`Show ${matchingCount} booking${matchingCount === 1 ? "" : "s"}`}
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
