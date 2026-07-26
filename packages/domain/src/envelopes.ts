import { DomainError, isDomainError, type DomainErrorShape, type ErrorCode } from "./errors.js";

/**
 * Typed API response envelope shared by mobile, Admin route handlers, and RPC
 * wrappers. Success and failure are discriminated by the `success` field.
 */

export type SuccessEnvelope<T> = {
  readonly success: true;
  readonly data: T;
  readonly message?: string;
};

export type ErrorEnvelope = {
  readonly success: false;
  readonly error: DomainErrorShape;
};

export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export function ok<T>(data: T, message?: string): SuccessEnvelope<T> {
  return message === undefined ? { success: true, data } : { success: true, data, message };
}

export function fail(error: DomainErrorShape): ErrorEnvelope {
  return { success: false, error };
}

/**
 * Convert any thrown value into a safe error envelope. Unknown/unexpected
 * errors collapse to INTERNAL_ERROR so provider internals never leak.
 */
export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  if (isDomainError(error)) {
    return fail(error.toShape());
  }
  return fail({ code: "INTERNAL_ERROR" satisfies ErrorCode, message: "Unexpected error" });
}

export function isSuccess<T>(envelope: ApiEnvelope<T>): envelope is SuccessEnvelope<T> {
  return envelope.success;
}

/** Unwrap a success envelope or throw the corresponding DomainError. */
export function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (envelope.success) return envelope.data;
  throw new DomainError(envelope.error.code, envelope.error.message, envelope.error.details ?? []);
}

export type Paginated<T> = {
  readonly items: ReadonlyArray<T>;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasMore: boolean;
};

export function paginate<T>(
  items: ReadonlyArray<T>,
  page: number,
  pageSize: number,
  total: number,
): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  };
}
