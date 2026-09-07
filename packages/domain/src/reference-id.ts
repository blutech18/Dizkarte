/**
 * Standardized formal reference code formatter for Dizkarte.
 *
 * Converts raw database UUIDs (e.g. `e167d9fa-9115-4e10-948c-1cb9e0cbcbb4`) into
 * clean, human-readable, formal entity reference codes.
 *
 * Formats supported:
 *  - Standard Entity Code: BK-E167D9FA, TSK-C21FE6C4, PAY-33333333
 *  - Date-based Reference Code: BK-20260820-E167, TSK-20260820-C21F
 */

export type EntityPrefix = "BK" | "TSK" | "PAY" | "USR" | "DSP" | "VER" | "TAP" | "MED" | "RPT";

const TIME_ZONE = "Asia/Manila";

export interface FormatReferenceOptions {
  /** Creation timestamp to include in the reference (e.g. YYYYMMDD) */
  readonly date?: string | Date | null;
  /** Use 2-digit year (YYMMDD) instead of 4-digit (YYYYMMDD) */
  readonly compactDate?: boolean;
}

/**
 * Extracts a formatted YYYYMMDD or YYMMDD string in Manila timezone (UTC+8).
 */
export function formatDateSegment(dateValue: string | Date, compact: boolean = false): string | null {
  const d = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  if (Number.isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";

  if (!year || !month || !day) return null;

  const formattedYear = compact ? year.slice(-2) : year;
  return `${formattedYear}${month}${day}`;
}

/**
 * Formats a raw UUID into a formal business reference string.
 *
 * @param id The raw UUID or identifier string.
 * @param prefix Entity prefix (e.g. "BK", "TSK", "PAY", "USR", "DSP").
 * @param options Optional configuration or creation date.
 */
export function formatReferenceId(
  id: string,
  prefix: EntityPrefix | string,
  options?: FormatReferenceOptions | string | Date | null,
): string {
  if (!id || typeof id !== "string") return "";

  let cleanId = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (prefix === "BK" && cleanId.startsWith("BOOKING")) {
    cleanId = cleanId.slice(7);
  } else if (prefix === "BK" && cleanId.startsWith("BKG")) {
    cleanId = cleanId.slice(3);
  } else if (prefix === "TSK" && cleanId.startsWith("TASK")) {
    cleanId = cleanId.slice(4);
  } else if (cleanId.startsWith(prefix.toUpperCase())) {
    cleanId = cleanId.slice(prefix.length);
  }
  if (cleanId.length === 0) return "";

  const opts: FormatReferenceOptions =
    typeof options === "string" || options instanceof Date
      ? { date: options }
      : options ?? {};

  if (opts.date) {
    const dateSegment = formatDateSegment(opts.date, Boolean(opts.compactDate));
    if (dateSegment) {
      const fragment = cleanId.slice(0, 4);
      return `${prefix}-${dateSegment}-${fragment}`;
    }
  }

  // Standard entity code (Prefix + 8-char uppercase hex)
  const fragment = cleanId.slice(0, 8);
  return `${prefix}-${fragment}`;
}
