import { describe, expect, it } from "vitest";
import { TEXT_LIMITS } from "@dizkarte/config";

import { buildQuoteTaskParams, MIN_QUOTE_DESCRIPTION } from "./quoteTaskParams";

/**
 * The quote/rebook sheet's only non-visual decision: is the brief long enough,
 * and what does the posting wizard receive?
 *
 * Worth testing on its own because the description doubles as the task TITLE, so
 * a brief longer than the title limit must be truncated here rather than rejected
 * by the wizard one screen later.
 */
describe("buildQuoteTaskParams", () => {
  const valid = "Please move a two-seater sofa down one flight of stairs.";

  it("refuses a brief that is too short to act on", () => {
    expect(buildQuoteTaskParams("", null)).toBeNull();
    expect(buildQuoteTaskParams("too short", null)).toBeNull();
    // Whitespace is not detail: padding must not satisfy the minimum.
    expect(buildQuoteTaskParams(`  ${"a".repeat(10)}${" ".repeat(40)}`, null)).toBeNull();
  });

  it("accepts a brief exactly at the minimum", () => {
    const exact = "a".repeat(MIN_QUOTE_DESCRIPTION);
    expect(buildQuoteTaskParams(exact, null)).toEqual({ title: exact });
  });

  it("carries the trimmed brief as the task title", () => {
    expect(buildQuoteTaskParams(`   ${valid}   `, null)).toEqual({ title: valid });
  });

  it("omits the category when none is known (a profile-initiated quote)", () => {
    const params = buildQuoteTaskParams(valid, null);
    expect(params && "category" in params).toBe(false);
  });

  it("carries the category when rebooking a past task", () => {
    expect(buildQuoteTaskParams(valid, "cat-123")).toEqual({ title: valid, category: "cat-123" });
  });

  it("truncates to the task-title limit instead of failing later", () => {
    const long = "x".repeat(TEXT_LIMITS.taskTitleMax + 50);
    expect(buildQuoteTaskParams(long, null)?.title).toHaveLength(TEXT_LIMITS.taskTitleMax);
  });
});
