import type { SupportedCurrency } from "@dizkarte/config";
import {
  asId,
  type PublicTaskFeedItem,
  type PublicTaskerProfile,
  type BookingRecord,
  type DerivedBalances,
  type TaskStatus,
  type BookingStatus,
  assertNoPrivateTaskFields,
  assertNoPrivateTaskerFields,
} from "@dizkarte/domain";

/**
 * Row shapes returned by the public-safe views/RPCs (snake_case, as PostgREST
 * serializes them). These are intentionally narrow — only the columns the
 * adapter reads — so unrelated column changes do not silently break mapping.
 */

export type RawTaskFeedRow = {
  readonly id: string;
  readonly category_id: string;
  readonly title: string;
  readonly description: string;
  readonly budget_centavos: number | string;
  readonly currency: string;
  readonly status: string;
  readonly same_day: boolean;
  readonly scheduled_for: string | null;
  readonly published_at: string | null;
  readonly city_code: string;
  readonly barangay_code: string;
  readonly landmark: string | null;
  readonly approximate_lat: number | string;
  readonly approximate_lng: number | string;
  readonly offer_count: number | string;
};

export type RawTaskerProfileRow = {
  readonly user_id: string;
  readonly display_name: string;
  readonly avatar_path: string | null;
  readonly public_bio: string | null;
  readonly public_experience: string | null;
  readonly completion_count: number | string;
  readonly rating_average: number | string | null;
  readonly rating_count: number | string;
  readonly suspended: boolean;
  readonly verified_identity: boolean;
};

export type RawBookingRow = {
  readonly id: string;
  readonly task_id: string;
  readonly client_id: string;
  readonly tasker_id: string;
  readonly agreed_centavos: number | string;
  readonly status: string;
};

export type RawDerivedBalancesRow = {
  readonly pending_centavos: number | string | null;
  readonly protected_centavos: number | string | null;
  readonly available_centavos: number | string | null;
  readonly reserved_centavos: number | string | null;
  readonly withdrawn_centavos: number | string | null;
};

/** Coerce a PostgREST numeric/bigint (which may arrive as a string) to a number. */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Expected a finite numeric value, received: ${JSON.stringify(value)}`);
  }
  return n;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

/**
 * Map a `public_task_feed` row to the public-safe DTO. The view already
 * excludes exact address/coordinates/contact; the runtime privacy guard is a
 * defense-in-depth re-assertion.
 */
export function mapTaskFeedRow(row: RawTaskFeedRow): PublicTaskFeedItem {
  const item: PublicTaskFeedItem = {
    id: asId<"TaskId">(row.id),
    categoryId: asId<"CategoryId">(row.category_id),
    title: row.title,
    description: row.description,
    budgetCentavos: toNumber(row.budget_centavos),
    currency: row.currency as SupportedCurrency,
    status: row.status as TaskStatus,
    sameDay: row.same_day,
    scheduledFor: row.scheduled_for,
    cityCode: row.city_code,
    barangayCode: row.barangay_code,
    landmark: row.landmark ?? "",
    approximateLat: toNumber(row.approximate_lat),
    approximateLng: toNumber(row.approximate_lng),
    publishedAt: row.published_at,
    offerCount: toNumber(row.offer_count),
  };
  assertNoPrivateTaskFields(item as unknown as Record<string, unknown>);
  return item;
}

/**
 * Map a `public_tasker_profiles` row plus separately-fetched specialty slugs
 * and service city codes to the public Tasker trust DTO.
 */
export function mapTaskerProfileRow(
  row: RawTaskerProfileRow,
  specialties: ReadonlyArray<string>,
  serviceCityCodes: ReadonlyArray<string>,
): PublicTaskerProfile {
  const profile: PublicTaskerProfile = {
    userId: asId<"UserId">(row.user_id),
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    publicBio: row.public_bio ?? "",
    publicExperience: row.public_experience ?? "",
    completionCount: toNumber(row.completion_count),
    ratingAverage: toNullableNumber(row.rating_average),
    ratingCount: toNumber(row.rating_count),
    specialties,
    serviceCityCodes,
    verifiedIdentity: row.verified_identity,
    suspended: row.suspended,
  };
  assertNoPrivateTaskerFields(profile as unknown as Record<string, unknown>);
  return profile;
}

export function mapBookingRow(row: RawBookingRow): BookingRecord {
  return {
    id: asId<"BookingId">(row.id),
    taskId: asId<"TaskId">(row.task_id),
    clientId: asId<"UserId">(row.client_id),
    taskerId: asId<"UserId">(row.tasker_id),
    agreedCentavos: toNumber(row.agreed_centavos),
    status: row.status as BookingStatus,
  };
}

export function mapDerivedBalancesRow(
  row: RawDerivedBalancesRow | null | undefined,
): DerivedBalances {
  return {
    pendingCentavos: toNumber(row?.pending_centavos ?? 0),
    protectedCentavos: toNumber(row?.protected_centavos ?? 0),
    availableCentavos: toNumber(row?.available_centavos ?? 0),
    reservedCentavos: toNumber(row?.reserved_centavos ?? 0),
    withdrawnCentavos: toNumber(row?.withdrawn_centavos ?? 0),
  };
}

/**
 * Sanitize a free-text search keyword for safe embedding in a PostgREST `or`
 * filter. Removes characters that are significant to the PostgREST filter
 * grammar (`,`, `(`, `)`, `*`, `:`, `.`, `%`, `\`) so a keyword can never break
 * out of the intended `ilike` clause. Search remains case-insensitive substring.
 */
export function sanitizeKeyword(keyword: string): string {
  return keyword
    .replace(/[,()*:.%\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
