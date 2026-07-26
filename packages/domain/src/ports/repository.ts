import type { Paginated } from "../envelopes.js";
import type { PublicTaskFeedItem } from "../dto/task.js";
import type { PublicTaskerProfile } from "../dto/tasker.js";
import type { TaskSearchInput } from "../schemas/task.js";
import type { BookingId, LedgerAccountId, TaskId, UserId } from "../ids.js";
import type { BookingStatus } from "../statuses.js";

/**
 * MarketplaceRepository port.
 *
 * The domain defines the shape of persistence access it needs; concrete
 * implementations (Supabase, synthetic) live in adapters. This keeps domain
 * logic free of Supabase/service-role/provider SDK imports.
 */

export type DerivedBalances = {
  readonly pendingCentavos: number;
  readonly protectedCentavos: number;
  readonly availableCentavos: number;
  readonly reservedCentavos: number;
  readonly withdrawnCentavos: number;
};

export type BookingRecord = {
  readonly id: BookingId;
  readonly taskId: TaskId;
  readonly clientId: UserId;
  readonly taskerId: UserId;
  readonly agreedCentavos: number;
  readonly status: BookingStatus;
};

export interface MarketplaceRepository {
  searchOpenTasks(input: TaskSearchInput): Promise<Paginated<PublicTaskFeedItem>>;
  getPublicTask(taskId: TaskId): Promise<PublicTaskFeedItem | null>;
  getPublicTaskerProfile(userId: UserId): Promise<PublicTaskerProfile | null>;
  getBooking(bookingId: BookingId): Promise<BookingRecord | null>;
  getDerivedBalances(userId: UserId): Promise<DerivedBalances>;
  getLedgerAccountBalance(accountId: LedgerAccountId): Promise<number>;
}
