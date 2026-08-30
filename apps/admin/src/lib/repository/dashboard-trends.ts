import type { DashboardTrends, DashboardTrendDay, DashboardTrendTotals } from "./types";

/**
 * Pure day-bucket aggregation for the dashboard trend charts.
 *
 * Kept out of both adapters so the bucketing, the outcome classification, and
 * the previous-period comparison can be unit-tested without a database, and so
 * the live and synthetic adapters cannot drift in how they group a day.
 */

/** Philippine Standard Time is a fixed UTC+8 with no daylight saving. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for the Manila calendar day a UTC instant falls in. */
export function manilaDayKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start of the Manila day, as a UTC instant. */
function startOfManilaDay(date: Date): Date {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - MANILA_OFFSET_MS);
}

export type TrendFeeInput = {
  readonly at: string;
  readonly amountCentavos: number;
};

export type TrendBookingInput = {
  readonly at: string;
  readonly status: string;
  readonly amountCentavos: number;
};

/** Bookings that ended badly. Grouped because the owner reads them as one signal. */
const FAILED_STATUSES = new Set(["CANCELLED", "PAYMENT_FAILED", "DISPUTED", "REFUNDED"]);

export type BookingOutcome = "completed" | "failed" | "active";

export function bookingOutcome(status: string): BookingOutcome {
  if (status === "COMPLETED") return "completed";
  if (FAILED_STATUSES.has(status)) return "failed";
  return "active";
}

function emptyTotals(): DashboardTrendTotals {
  return {
    platformFeeCentavos: 0,
    grossBookedCentavos: 0,
    bookingsCreated: 0,
    bookingsCompleted: 0,
  };
}

/**
 * Build `days` consecutive Manila-day buckets ending today, plus the totals for
 * the equally long window immediately before it.
 *
 * Rows outside both windows are ignored rather than folded into the nearest
 * bucket: a chart that silently absorbs older data would misstate the period.
 */
export function buildDashboardTrends(input: {
  readonly fees: ReadonlyArray<TrendFeeInput>;
  readonly bookings: ReadonlyArray<TrendBookingInput>;
  readonly days: number;
  readonly now?: Date;
}): DashboardTrends {
  const days = Math.max(1, Math.floor(input.days));
  const now = input.now ?? new Date();
  const todayStart = startOfManilaDay(now);
  const dayMs = 24 * 60 * 60 * 1000;

  const windowStart = new Date(todayStart.getTime() - (days - 1) * dayMs);
  const previousStart = new Date(windowStart.getTime() - days * dayMs);

  const buckets = new Map<string, DashboardTrendDay>();
  const order: string[] = [];
  for (let index = 0; index < days; index += 1) {
    const key = manilaDayKey(new Date(windowStart.getTime() + index * dayMs));
    if (!key) continue;
    order.push(key);
    buckets.set(key, {
      date: key,
      platformFeeCentavos: 0,
      grossBookedCentavos: 0,
      bookingsCreated: 0,
      bookingsCompleted: 0,
      bookingsFailed: 0,
      bookingsActive: 0,
    });
  }

  const previous = emptyTotals();
  const previousMutable = previous as { -readonly [K in keyof DashboardTrendTotals]: number };

  const inPreviousWindow = (at: string): boolean => {
    const time = new Date(at).getTime();
    return Number.isFinite(time) && time >= previousStart.getTime() && time < windowStart.getTime();
  };

  for (const fee of input.fees) {
    const amount = Number(fee.amountCentavos);
    if (!Number.isFinite(amount)) continue;
    const key = manilaDayKey(fee.at);
    const bucket = key ? buckets.get(key) : undefined;
    if (bucket) {
      (bucket as { platformFeeCentavos: number }).platformFeeCentavos += amount;
    } else if (inPreviousWindow(fee.at)) {
      previousMutable.platformFeeCentavos += amount;
    }
  }

  for (const booking of input.bookings) {
    const amount = Number.isFinite(Number(booking.amountCentavos))
      ? Number(booking.amountCentavos)
      : 0;
    const outcome = bookingOutcome(booking.status);
    const key = manilaDayKey(booking.at);
    const bucket = key ? buckets.get(key) : undefined;

    if (bucket) {
      const mutable = bucket as {
        -readonly [K in keyof DashboardTrendDay]: DashboardTrendDay[K];
      };
      mutable.bookingsCreated += 1;
      mutable.grossBookedCentavos += amount;
      if (outcome === "completed") mutable.bookingsCompleted += 1;
      else if (outcome === "failed") mutable.bookingsFailed += 1;
      else mutable.bookingsActive += 1;
      continue;
    }

    if (inPreviousWindow(booking.at)) {
      previousMutable.bookingsCreated += 1;
      previousMutable.grossBookedCentavos += amount;
      if (outcome === "completed") previousMutable.bookingsCompleted += 1;
    }
  }

  const series = order.map((key) => buckets.get(key)!).filter(Boolean);
  const current = series.reduce<DashboardTrendTotals>(
    (totals, day) => ({
      platformFeeCentavos: totals.platformFeeCentavos + day.platformFeeCentavos,
      grossBookedCentavos: totals.grossBookedCentavos + day.grossBookedCentavos,
      bookingsCreated: totals.bookingsCreated + day.bookingsCreated,
      bookingsCompleted: totals.bookingsCompleted + day.bookingsCompleted,
    }),
    emptyTotals(),
  );

  return { days: series, current, previous, windowDays: days };
}

/**
 * Percentage change between two periods, or `null` when there is no baseline.
 *
 * Null rather than 0 or 100: "no comparable activity last period" and "flat"
 * are different facts, and a fabricated percentage would misinform the owner.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
