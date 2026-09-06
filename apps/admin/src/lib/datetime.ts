/**
 * Shared date/time presentation for the Admin console.
 *
 * Every formatter pins the locale *and* the time zone. `toLocaleString()`
 * without a time zone resolves against the runtime, so the same row rendered on
 * the server and re-rendered on the client could disagree, and two admins in
 * different regions would read different timestamps for one audited event.
 * Operations are run from Philippine time, so that is the console's clock.
 */

const TIME_ZONE = "Asia/Manila";

const DATE_TIME = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

/** Absolute timestamp, e.g. `24 Jul 2026, 8:59 PM`. */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : DATE_TIME.format(date);
}

const DATE_ONLY = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

/**
 * Date without the time, e.g. `Jul 24, 2026`.
 *
 * For dense card layouts where a full timestamp is more precision than the
 * decision needs. Callers keep the exact instant on the `<time>` element's
 * `dateTime`, so nothing is lost.
 */
export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : DATE_ONLY.format(date);
}

const TIME_ONLY = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

/**
 * Time without the date, e.g. `8:59 PM`.
 */
export function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : TIME_ONLY.format(date);
}

const DATE_NUMERIC = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

/**
 * Numeric date in ISO format, e.g. `2026-07-24`.
 */
export function formatDateNumeric(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : DATE_NUMERIC.format(date);
}

const TIME_NUMERIC = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

/**
 * Numeric 24-hour time, e.g. `20:59`.
 */
export function formatTimeNumeric(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : TIME_NUMERIC.format(date);
}

/**
 * Coarse elapsed-time label for queue triage, e.g. `3 days`, `5 hours`.
 *
 * Deliberately coarse: an ops queue is triaged by order of magnitude, and a
 * to-the-second value implies a precision the review workflow does not have.
 */
export function formatElapsed(value: string, now: Date = new Date()): string {
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "Unknown";

  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 0) return "Not yet due";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;

  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}
