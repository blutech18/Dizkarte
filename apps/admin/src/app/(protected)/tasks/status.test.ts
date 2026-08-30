import { describe, expect, it } from "vitest";
import { TASK_STATUS_OPTIONS, taskStatusLabel, taskStatusTone } from "./status";

describe("task status vocabulary", () => {
  it("maps every status to plain language with no raw enum leaking through", () => {
    for (const status of TASK_STATUS_OPTIONS) {
      const label = taskStatusLabel(status);
      expect(label).not.toMatch(/_/);
      expect(label).not.toBe(status);
    }
  });

  it("distinguishes live, finished, and problem states by tone", () => {
    expect(taskStatusTone("COMPLETED")).toBe("success");
    expect(taskStatusTone("DISPUTED")).toBe("error");
    expect(taskStatusTone("REMOVED")).toBe("error");
    expect(taskStatusTone("OPEN")).toBe("brand");
    expect(taskStatusTone("IN_PROGRESS")).toBe("info");
    // Inert states must not be coloured as problems.
    expect(taskStatusTone("DRAFT")).toBe("neutral");
    expect(taskStatusTone("EXPIRED")).toBe("neutral");
    expect(taskStatusTone("CANCELLED")).toBe("neutral");
  });

  it("falls back to the raw value for an unknown status", () => {
    expect(taskStatusLabel("MYSTERY")).toBe("MYSTERY");
    expect(taskStatusTone("MYSTERY")).toBe("neutral");
  });
});
