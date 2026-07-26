import { describe, expect, it } from "vitest";
import {
  DomainError,
  errors,
  fail,
  isSuccess,
  ok,
  paginate,
  toErrorEnvelope,
  unwrap,
  ERROR_HTTP_STATUS,
} from "./index.js";

describe("api envelopes", () => {
  it("wraps success and failure", () => {
    expect(ok({ a: 1 })).toEqual({ success: true, data: { a: 1 } });
    const f = fail({ code: "NOT_FOUND", message: "gone" });
    expect(isSuccess(f)).toBe(false);
  });

  it("unwrap returns data or throws the DomainError", () => {
    expect(unwrap(ok(42))).toBe(42);
    expect(() => unwrap(fail({ code: "FORBIDDEN", message: "no" }))).toThrow(DomainError);
  });

  it("toErrorEnvelope collapses unknown errors to INTERNAL_ERROR", () => {
    const known = toErrorEnvelope(errors.conflict("dup"));
    expect(known.error.code).toBe("CONFLICT");
    const unknown = toErrorEnvelope(new Error("provider secret leaked here"));
    expect(unknown.error.code).toBe("INTERNAL_ERROR");
    expect(unknown.error.message).not.toContain("secret");
  });

  it("maps error codes to http statuses", () => {
    expect(ERROR_HTTP_STATUS.VALIDATION_ERROR).toBe(400);
    expect(ERROR_HTTP_STATUS.UNAUTHENTICATED).toBe(401);
    expect(ERROR_HTTP_STATUS.CONFIGURATION_ERROR).toBe(503);
  });

  it("paginate reports hasMore correctly", () => {
    expect(paginate([1, 2], 1, 2, 5).hasMore).toBe(true);
    expect(paginate([1, 2], 3, 2, 6).hasMore).toBe(false);
  });
});
