import type { BookingStatus } from "@dizkarte/domain";
import type { BookingRecord } from "../../services/marketplace/types";

/**
 * Framework-free filter logic for the booking list.
 *
 * Only fields a `BookingRecord` (plus the already-loaded conversation summary)
 * actually carries are filterable: stage, which side the viewer is on, the
 * booked date, the agreed amount, and whether there are unread messages.
 *
 * There is deliberately no location filter here. A booking's address is
 * privacy-gated — `exactAddress` is null until the viewer is authorized — and
 * the record carries no PSGC city code, so a "near me" control would silently
 * drop the bookings whose location the viewer is not yet allowed to see.
 */

export type BookingFilterKey = "all" | "attention" | "payment" | "active" | "completed" | "issues";

/** Which side of the booking the viewer is on. One account can be both. */
export type BookingRoleFilter = "any" | "client" | "tasker";

export type BookingSort = "recent" | "oldest" | "highest_amount";

export type BookingFilterState = {
  readonly stage: BookingFilterKey;
  readonly role: BookingRoleFilter;
  /** Inclusive ISO bounds on when the booking was created. */
  readonly bookedFrom?: string;
  readonly bookedTo?: string;
  readonly minAmountCentavos?: number;
  readonly maxAmountCentavos?: number;
  readonly unreadOnly?: boolean;
  readonly sort: BookingSort;
};

export const DEFAULT_BOOKING_FILTERS: BookingFilterState = {
  stage: "all",
  role: "any",
  sort: "recent",
};

export const BOOKING_FILTERS: ReadonlyArray<{
  readonly key: BookingFilterKey;
  readonly label: string;
  readonly icon: "note" | "bell" | "wallet" | "briefcase" | "check-circle" | "alert-circle";
}> = [
  { key: "all", label: "All", icon: "note" },
  { key: "attention", label: "Needs action", icon: "bell" },
  { key: "payment", label: "Payment", icon: "wallet" },
  { key: "active", label: "Active", icon: "briefcase" },
  { key: "completed", label: "Completed", icon: "check-circle" },
  { key: "issues", label: "Issues", icon: "alert-circle" },
];

export const BOOKING_ROLE_OPTIONS: ReadonlyArray<{
  readonly key: BookingRoleFilter;
  readonly label: string;
}> = [
  { key: "any", label: "Both roles" },
  { key: "client", label: "I hired" },
  { key: "tasker", label: "I worked" },
];

export const BOOKING_SORT_OPTIONS: ReadonlyArray<{
  readonly key: BookingSort;
  readonly label: string;
}> = [
  { key: "recent", label: "Recently updated" },
  { key: "oldest", label: "Oldest first" },
  { key: "highest_amount", label: "Highest amount" },
];

/**
 * Whether this status needs something from the viewer.
 *
 * Mirrors the row copy on the bookings screen: the filter and the row must
 * agree, otherwise "Needs action" would list rows that say they are waiting on
 * the other participant.
 */
export function bookingNeedsAttention(status: BookingStatus, isClient: boolean): boolean {
  switch (status) {
    case "PAYMENT_PENDING":
    case "PAYMENT_FAILED":
      return isClient;
    case "CONFIRMED":
      return !isClient;
    case "COMPLETION_REQUESTED":
      return isClient;
    default:
      return false;
  }
}

export function matchesBookingStage(
  status: BookingStatus,
  stage: BookingFilterKey,
  isClient: boolean,
): boolean {
  switch (stage) {
    case "all":
      return true;
    case "attention":
      return bookingNeedsAttention(status, isClient);
    case "payment":
      return status === "PAYMENT_PENDING" || status === "PAYMENT_FAILED";
    case "active":
      return (
        status === "CONFIRMED" || status === "IN_PROGRESS" || status === "COMPLETION_REQUESTED"
      );
    case "completed":
      return status === "COMPLETED";
    case "issues":
      return status === "CANCELLED" || status === "DISPUTED" || status === "REFUNDED";
  }
}

/** Viewer-dependent context the pure matcher needs. */
export type BookingFilterContext = {
  readonly viewerId: string;
  /** Unread message count for the booking's conversation; 0 when there is none. */
  readonly unreadCount: (booking: BookingRecord) => number;
  /**
   * Plain-language status label, included in the keyword haystack so searching
   * "refunded" keeps working as it does on the list itself.
   */
  readonly statusLabel?: (status: BookingStatus) => string;
};

function withinDateRange(value: string, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  if (from) {
    const fromTime = new Date(from).getTime();
    if (!Number.isNaN(fromTime) && time < fromTime) return false;
  }
  if (to) {
    const toTime = new Date(to).getTime();
    if (!Number.isNaN(toTime) && time > toTime) return false;
  }
  return true;
}

export function matchesBookingFilters(
  booking: BookingRecord,
  filters: BookingFilterState,
  context: BookingFilterContext,
  keyword = "",
): boolean {
  const isClient = booking.clientId === context.viewerId;

  if (filters.role === "client" && !isClient) return false;
  if (filters.role === "tasker" && isClient) return false;
  if (!matchesBookingStage(booking.status, filters.stage, isClient)) return false;

  if (
    typeof filters.minAmountCentavos === "number" &&
    booking.agreedCentavos < filters.minAmountCentavos
  ) {
    return false;
  }
  if (
    typeof filters.maxAmountCentavos === "number" &&
    booking.agreedCentavos > filters.maxAmountCentavos
  ) {
    return false;
  }

  if (!withinDateRange(booking.createdAt, filters.bookedFrom, filters.bookedTo)) return false;
  if (filters.unreadOnly && context.unreadCount(booking) <= 0) return false;

  const trimmed = keyword.trim().toLowerCase();
  if (trimmed.length > 0) {
    const counterpart = isClient ? booking.taskerDisplayName : booking.clientDisplayName;
    const statusLabel = context.statusLabel?.(booking.status) ?? "";
    const haystack = `${booking.taskTitle} ${counterpart} ${statusLabel}`.toLowerCase();
    if (!haystack.includes(trimmed)) return false;
  }

  return true;
}

function timeOf(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function sortBookings(
  bookings: ReadonlyArray<BookingRecord>,
  sort: BookingSort,
): ReadonlyArray<BookingRecord> {
  const copy = [...bookings];
  switch (sort) {
    case "recent":
      return copy.sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt));
    case "oldest":
      return copy.sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));
    case "highest_amount":
      return copy.sort((a, b) => b.agreedCentavos - a.agreedCentavos);
  }
}

/** Per-stage counts measured against every other applied filter. */
export function countBookingsByStage(
  bookings: ReadonlyArray<BookingRecord>,
  filters: BookingFilterState,
  context: BookingFilterContext,
  keyword = "",
): Readonly<Record<BookingFilterKey, number>> {
  const counts: Record<BookingFilterKey, number> = {
    all: 0,
    attention: 0,
    payment: 0,
    active: 0,
    completed: 0,
    issues: 0,
  };
  for (const option of BOOKING_FILTERS) {
    counts[option.key] = bookings.filter((booking) =>
      matchesBookingFilters(booking, { ...filters, stage: option.key }, context, keyword),
    ).length;
  }
  return counts;
}

export function activeBookingFilterCount(filters: BookingFilterState): number {
  let count = 0;
  if (filters.stage !== "all") count += 1;
  if (filters.role !== "any") count += 1;
  if (filters.bookedFrom || filters.bookedTo) count += 1;
  if (typeof filters.minAmountCentavos === "number") count += 1;
  if (typeof filters.maxAmountCentavos === "number") count += 1;
  if (filters.unreadOnly) count += 1;
  if (filters.sort !== "recent") count += 1;
  return count;
}

export function describeBookingFilters(filters: BookingFilterState): ReadonlyArray<string> {
  const chips: string[] = [];
  if (filters.stage !== "all") {
    chips.push(
      BOOKING_FILTERS.find((option) => option.key === filters.stage)?.label ?? filters.stage,
    );
  }
  if (filters.role !== "any") {
    chips.push(
      BOOKING_ROLE_OPTIONS.find((option) => option.key === filters.role)?.label ?? filters.role,
    );
  }
  if (filters.unreadOnly) chips.push("Unread messages");
  if (typeof filters.minAmountCentavos === "number") {
    chips.push(`Min \u20b1${(filters.minAmountCentavos / 100).toFixed(2)}`);
  }
  if (typeof filters.maxAmountCentavos === "number") {
    chips.push(`Max \u20b1${(filters.maxAmountCentavos / 100).toFixed(2)}`);
  }
  if (filters.bookedFrom || filters.bookedTo) {
    const from = filters.bookedFrom ? filters.bookedFrom.slice(0, 10) : "any";
    const to = filters.bookedTo ? filters.bookedTo.slice(0, 10) : "any";
    chips.push(`Booked ${from} \u2192 ${to}`);
  }
  if (filters.sort !== "recent") {
    chips.push(
      BOOKING_SORT_OPTIONS.find((option) => option.key === filters.sort)?.label ?? filters.sort,
    );
  }
  return chips;
}
