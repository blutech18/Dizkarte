import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { CenterDialogModal } from "../ui/CenterDialogModal";
import { Icon } from "../ui/Icon";
import { theme, spacing, fontSize, lineHeight, radii } from "../../theme";

type DateMode = "on_date" | "before_date" | "flexible";

export function TaskSchedulePicker({
  sameDay,
  scheduledFor,
  onChange,
}: {
  readonly sameDay: boolean;
  readonly scheduledFor: string;
  readonly onChange: (next: { readonly sameDay: boolean; readonly scheduledFor: string }) => void;
}) {
  const [activePicker, setActivePicker] = useState<Exclude<DateMode, "flexible"> | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => dateFromSchedule(scheduledFor));

  const dateMode: DateMode = sameDay
    ? "on_date"
    : scheduledFor.trim().length > 0
      ? "before_date"
      : "flexible";
  // Keep the closing dialog's copy stable while CenterDialogModal finishes its
  // exit animation instead of switching to another mode for the final frame.
  const visiblePickerMode = activePicker ?? (sameDay ? "on_date" : "before_date");

  function openOnDate() {
    const initial = dateFromSchedule(scheduledFor);
    setSelectedDate(initial);
    setActivePicker("on_date");
    onChange({
      sameDay: true,
      scheduledFor: scheduledFor || formatSchedule(initial),
    });
  }

  function openBeforeDate() {
    const initial = scheduledFor ? dateFromSchedule(scheduledFor) : daysFromNow(3);
    setSelectedDate(initial);
    setActivePicker("before_date");
    onChange({
      sameDay: false,
      scheduledFor: scheduledFor || formatSchedule(initial),
    });
  }

  function selectDate(date: Date) {
    setSelectedDate(date);
    onChange({
      sameDay: activePicker === "on_date",
      scheduledFor: formatSchedule(date),
    });
    setActivePicker(null);
  }

  return (
    <>
      <View style={styles.modeGroup}>
        <ScheduleModeButton
          label={dateMode === "on_date" ? dateButtonLabel("On", scheduledFor) : "On date"}
          selected={dateMode === "on_date"}
          onPress={openOnDate}
        />
        <ScheduleModeButton
          label={
            dateMode === "before_date" ? dateButtonLabel("Before", scheduledFor) : "Before date"
          }
          selected={dateMode === "before_date"}
          onPress={openBeforeDate}
        />
        <ScheduleModeButton
          label="I'm flexible"
          selected={dateMode === "flexible"}
          onPress={() => {
            setActivePicker(null);
            onChange({ sameDay: false, scheduledFor: "" });
          }}
        />
      </View>

      <CalendarPickerModal
        visible={activePicker !== null}
        selectedDate={selectedDate}
        title={visiblePickerMode === "on_date" ? "Select task date" : "Select completion deadline"}
        description={
          visiblePickerMode === "on_date"
            ? "Choose the date you need the task completed."
            : "Choose the latest date the task can be completed."
        }
        confirmLabel={visiblePickerMode === "on_date" ? "Use this date" : "Use this deadline"}
        onConfirm={selectDate}
        onClose={() => setActivePicker(null)}
      />
    </>
  );
}

function ScheduleModeButton({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.modeButton,
        selected ? styles.modeButtonSelected : null,
        pressed ? styles.modeButtonPressed : null,
      ]}
    >
      <Text style={[styles.modeText, selected ? styles.modeTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

export function CalendarPickerModal({
  visible,
  selectedDate,
  title = "Select a date",
  description = "Choose a date from the calendar.",
  confirmLabel = "Select date",
  useModal = true,
  onConfirm,
  onClose,
}: {
  readonly visible: boolean;
  readonly selectedDate: Date;
  readonly title?: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly useModal?: boolean;
  readonly onConfirm: (date: Date) => void;
  readonly onClose: () => void;
}) {
  const [currentDate, setCurrentDate] = useState<Date>(selectedDate);
  const [viewDate, setViewDate] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  useEffect(() => {
    setCurrentDate(selectedDate);
    setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [selectedDate, visible]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString("en-US", { month: "long" });
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Array<number | null> = [
    ...Array.from({ length: firstDayOfWeek }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <CenterDialogModal visible={visible} useModal={useModal} onClose={onClose}>
      <ScrollView
        style={styles.modalFrame}
        contentContainerStyle={styles.modalContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.modalHeading}>
          <View style={styles.modalTitleRow}>
            <Text style={styles.modalTitle} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close calendar"
              hitSlop={8}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.closeButtonPressed : null,
              ]}
            >
              <Icon name="close" size={16} color={theme.textSecondary} />
            </Pressable>
          </View>
          {description ? <Text style={styles.modalDescription}>{description}</Text> : null}
        </View>

        <View style={styles.calendarHeader}>
          <Text style={styles.monthTitle}>{`${monthName} ${year}`}</Text>
          <View style={styles.navButtons}>
            <Pressable
              onPress={() => setViewDate(new Date(year, month - 1, 1))}
              style={({ pressed }) => [styles.navButton, pressed ? styles.navButtonPressed : null]}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={4}
            >
              <View style={{ transform: [{ scaleX: -1 }] }}>
                <Icon name="arrow-right" size={15} color={theme.textPrimary} />
              </View>
            </Pressable>
            <Pressable
              onPress={() => setViewDate(new Date(year, month + 1, 1))}
              style={({ pressed }) => [styles.navButton, pressed ? styles.navButtonPressed : null]}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={4}
            >
              <Icon name="arrow-right" size={15} color={theme.textPrimary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.weekHeader}>
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => (
            <Text key={day} style={styles.weekDay}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.daysGrid}>
          {days.map((day, index) => {
            if (day === null) {
              return <View key={`empty-${index}`} style={styles.dayCell} />;
            }
            const date = new Date(year, month, day);
            const selected = isSameDate(date, currentDate);
            return (
              <Pressable
                key={`${year}-${month}-${day}`}
                onPress={() => setCurrentDate(date)}
                accessibilityRole="button"
                accessibilityLabel={date.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.dayCell,
                  selected ? styles.daySelected : null,
                  pressed ? styles.dayPressed : null,
                ]}
              >
                <Text style={[styles.dayText, selected ? styles.dayTextSelected : null]}>
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.modalFooter}>
          <Button label={confirmLabel} onPress={() => onConfirm(currentDate)} fullWidth />
        </View>
      </ScrollView>
    </CenterDialogModal>
  );
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function dateFromSchedule(input: string): Date {
  if (!input.trim()) return new Date();
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatSchedule(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} 09:00`;
}

function dateButtonLabel(prefix: "On" | "Before", input: string): string {
  const date = dateFromSchedule(input);
  const dayName = date.toLocaleString("en-US", { weekday: "short" });
  const monthName = date.toLocaleString("en-US", { month: "short" });
  return `${prefix} ${dayName}, ${monthName} ${date.getDate()}`;
}

function isSameDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

const styles = StyleSheet.create({
  modeGroup: {
    gap: spacing.sm,
  },
  modeButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
    paddingHorizontal: spacing.md,
  },
  modeButtonSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  modeButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  modeText: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "600",
    textAlign: "center",
  },
  modeTextSelected: {
    color: theme.onPrimary,
    fontWeight: "700",
  },
  modalFrame: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "100%",
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalContent: {
    padding: spacing.lg,
  },
  modalHeading: {
    minWidth: 0,
    gap: 4,
  },
  modalTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  modalTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  modalDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs + 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
  },
  closeButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.95 }],
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.md + 2,
    marginBottom: spacing.sm,
  },
  monthTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  navButtons: {
    flexDirection: "row",
    gap: 6,
  },
  navButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  navButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
  },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs + 2,
    paddingVertical: 2,
  },
  weekDay: {
    width: "14%",
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14%",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 1,
  },
  daySelected: {
    borderRadius: 20,
    backgroundColor: theme.primary,
  },
  dayPressed: {
    opacity: 0.7,
  },
  dayText: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  dayTextSelected: {
    color: theme.onPrimary,
    fontWeight: "800",
  },
  modalFooter: {
    marginTop: spacing.lg,
  },
});

