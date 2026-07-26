import type { CategoryId, TaskId, UserId } from "../ids.js";
import type { TaskStatus } from "../statuses.js";
import type { SupportedCurrency } from "@dizkarte/config";

/**
 * Public-safe task projection.
 *
 * Feed/detail/map payloads MUST contain zero exact-address, private-coordinate,
 * contact, ID-document, or payment fields (requirement R4). This type only
 * carries approximate location and non-sensitive fields.
 */
export type PublicTaskFeedItem = {
  readonly id: TaskId;
  readonly categoryId: CategoryId;
  readonly title: string;
  readonly description: string;
  readonly budgetCentavos: number;
  readonly currency: SupportedCurrency;
  readonly status: TaskStatus;
  readonly sameDay: boolean;
  readonly scheduledFor: string | null;
  readonly cityCode: string;
  readonly barangayCode: string;
  readonly landmark: string;
  readonly approximateLat: number;
  readonly approximateLng: number;
  readonly publishedAt: string | null;
  readonly offerCount: number;
};

/**
 * Fields that must NEVER appear in a public task projection. Used by the runtime
 * privacy assertion and by tests.
 */
export const FORBIDDEN_PUBLIC_TASK_FIELDS = [
  "exactAddress",
  "exactLat",
  "exactLng",
  "clientId",
  "clientMobile",
  "clientEmail",
  "privateLocation",
  "paymentIntentId",
  "idDocument",
] as const;

/**
 * Runtime guard asserting a projected object exposes none of the forbidden
 * private fields. Defense-in-depth alongside the type and the SQL views.
 */
export function assertNoPrivateTaskFields(candidate: Record<string, unknown>): void {
  for (const field of FORBIDDEN_PUBLIC_TASK_FIELDS) {
    if (field in candidate) {
      throw new Error(`Public task projection leaked forbidden field: ${field}`);
    }
  }
}

/**
 * Source shape accepted by the projection. Wider than the output on purpose so
 * the projection strips private fields rather than trusting callers.
 */
export type TaskProjectionSource = {
  id: TaskId;
  categoryId: CategoryId;
  clientId: UserId;
  title: string;
  description: string;
  budgetCentavos: number;
  currency: SupportedCurrency;
  status: TaskStatus;
  sameDay: boolean;
  scheduledFor: string | null;
  publishedAt: string | null;
  offerCount: number;
  publicLocation: {
    cityCode: string;
    barangayCode: string;
    landmark: string;
    approximateLat: number;
    approximateLng: number;
  };
  // Private location intentionally omitted from the projection input contract.
};

export function toPublicTaskFeedItem(source: TaskProjectionSource): PublicTaskFeedItem {
  const item: PublicTaskFeedItem = {
    id: source.id,
    categoryId: source.categoryId,
    title: source.title,
    description: source.description,
    budgetCentavos: source.budgetCentavos,
    currency: source.currency,
    status: source.status,
    sameDay: source.sameDay,
    scheduledFor: source.scheduledFor,
    cityCode: source.publicLocation.cityCode,
    barangayCode: source.publicLocation.barangayCode,
    landmark: source.publicLocation.landmark,
    approximateLat: source.publicLocation.approximateLat,
    approximateLng: source.publicLocation.approximateLng,
    publishedAt: source.publishedAt,
    offerCount: source.offerCount,
  };
  assertNoPrivateTaskFields(item as unknown as Record<string, unknown>);
  return item;
}
