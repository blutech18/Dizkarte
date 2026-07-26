/**
 * Stable domain error codes and the DomainError type.
 *
 * Codes are stable public contract values. Messages are safe for clients and
 * never include stack traces, provider internals, secrets, or PII.
 */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_STATE",
  "PROVIDER_UNAVAILABLE",
  "CONFIGURATION_ERROR",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type DomainErrorDetail = {
  readonly field?: string;
  readonly message: string;
};

export type DomainErrorShape = {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: ReadonlyArray<DomainErrorDetail>;
};

export class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly details: ReadonlyArray<DomainErrorDetail>;

  constructor(code: ErrorCode, message: string, details: ReadonlyArray<DomainErrorDetail> = []) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }

  toShape(): DomainErrorShape {
    return this.details.length > 0
      ? { code: this.code, message: this.message, details: this.details }
      : { code: this.code, message: this.message };
  }
}

/** Default HTTP-ish status mapping for transport layers. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  PROVIDER_UNAVAILABLE: 502,
  CONFIGURATION_ERROR: 503,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

// Convenience constructors keep call sites concise and consistent.
export const errors = {
  validation: (message = "Validation failed", details?: ReadonlyArray<DomainErrorDetail>) =>
    new DomainError("VALIDATION_ERROR", message, details),
  unauthenticated: (message = "Authentication required") =>
    new DomainError("UNAUTHENTICATED", message),
  forbidden: (message = "You are not allowed to perform this action") =>
    new DomainError("FORBIDDEN", message),
  notFound: (message = "Resource not found") => new DomainError("NOT_FOUND", message),
  conflict: (message = "Conflicting request") => new DomainError("CONFLICT", message),
  invalidState: (message = "Action not allowed in the current state") =>
    new DomainError("INVALID_STATE", message),
  providerUnavailable: (message = "Provider is unavailable") =>
    new DomainError("PROVIDER_UNAVAILABLE", message),
  configuration: (message = "Server configuration is incomplete") =>
    new DomainError("CONFIGURATION_ERROR", message),
  rateLimited: (message = "Too many requests") => new DomainError("RATE_LIMITED", message),
  internal: (message = "Unexpected error") => new DomainError("INTERNAL_ERROR", message),
} as const;

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
