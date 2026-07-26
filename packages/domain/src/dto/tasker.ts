import type { UserId } from "../ids.js";

/**
 * Public Tasker trust projection.
 *
 * Excludes private identity, payout details, exact address, and Admin notes
 * (requirement R3). Rating is derived from aggregates maintained server-side.
 */
export type PublicTaskerProfile = {
  readonly userId: UserId;
  readonly displayName: string;
  readonly avatarPath: string | null;
  readonly publicBio: string;
  readonly publicExperience: string;
  readonly completionCount: number;
  readonly ratingAverage: number | null;
  readonly ratingCount: number;
  readonly specialties: ReadonlyArray<string>;
  readonly serviceCityCodes: ReadonlyArray<string>;
  readonly verifiedIdentity: boolean;
  readonly suspended: boolean;
};

export const FORBIDDEN_PUBLIC_TASKER_FIELDS = [
  "payoutMethodId",
  "payoutMethodReference",
  "payoutProvider",
  "email",
  "mobile",
  "exactAddress",
  "adminNotes",
  "idDocument",
] as const;

export function assertNoPrivateTaskerFields(candidate: Record<string, unknown>): void {
  for (const field of FORBIDDEN_PUBLIC_TASKER_FIELDS) {
    if (field in candidate) {
      throw new Error(`Public tasker projection leaked forbidden field: ${field}`);
    }
  }
}

/** Compute a rounded rating average from ledger-like aggregate sums. */
export function ratingAverage(ratingSum: number, ratingCount: number): number | null {
  if (ratingCount <= 0) return null;
  return Math.round((ratingSum / ratingCount) * 100) / 100;
}
