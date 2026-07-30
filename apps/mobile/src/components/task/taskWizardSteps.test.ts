import { describe, expect, it } from "vitest";
import {
  WIZARD_STEP_IDS,
  budgetToCentavos,
  canContinue,
  firstIncompleteStep,
  stepProgress,
  stepsFor,
  validateStep,
} from "./taskWizardSteps";
import { EMPTY_TASK_DRAFT_FORM, type TaskDraftFormValue } from "./taskDraftValue";

function form(overrides: Partial<TaskDraftFormValue> = {}): TaskDraftFormValue {
  return { ...EMPTY_TASK_DRAFT_FORM, ...overrides };
}

const COMPLETE = form({
  categoryId: "22222222-2222-4222-8222-222222222222",
  title: "Move my couch",
  description: "A two-seater couch needs moving to a new unit two streets away.",
  budget: "1500",
  sameDay: true,
  landmark: "Near SM North EDSA",
  exactAddress: "12 Sample Road, Quezon City",
});

describe("stepsFor", () => {
  it("asks for a category when none was chosen", () => {
    expect(stepsFor(false)).toContain("category");
    expect(stepsFor(false)).toHaveLength(WIZARD_STEP_IDS.length);
  });

  it("skips the category step when one was chosen on the home grid", () => {
    const steps = stepsFor(true);
    expect(steps).not.toContain("category");
    expect(steps).toHaveLength(WIZARD_STEP_IDS.length - 1);
  });

  it("always ends on review", () => {
    expect(stepsFor(true).at(-1)).toBe("review");
    expect(stepsFor(false).at(-1)).toBe("review");
  });
});

describe("budgetToCentavos", () => {
  it("converts pesos to integer centavos", () => {
    expect(budgetToCentavos("1500")).toBe(150_000);
    expect(budgetToCentavos("20.50")).toBe(2050);
  });

  it("ignores currency symbols and separators", () => {
    expect(budgetToCentavos("₱1500")).toBe(150_000);
  });

  it("returns null for an empty or unusable value", () => {
    expect(budgetToCentavos("")).toBeNull();
    expect(budgetToCentavos("   ")).toBeNull();
    expect(budgetToCentavos("abc")).toBeNull();
  });
});

describe("validateStep", () => {
  it("requires a category", () => {
    expect(validateStep("category", form())).not.toBeNull();
    expect(validateStep("category", COMPLETE)).toBeNull();
  });

  it("enforces the title length the schema enforces", () => {
    expect(validateStep("title", form({ title: "" }))).not.toBeNull();
    expect(validateStep("title", form({ title: "Move" }))).not.toBeNull();
    expect(validateStep("title", form({ title: "Move it" }))).toBeNull();
    expect(validateStep("title", form({ title: "x".repeat(121) }))).not.toBeNull();
  });

  it("requires a description with real detail", () => {
    expect(validateStep("description", form({ description: "too short" }))).not.toBeNull();
    expect(validateStep("description", COMPLETE)).toBeNull();
  });

  it("enforces the minimum budget", () => {
    expect(validateStep("budget", form({ budget: "" }))).not.toBeNull();
    expect(validateStep("budget", form({ budget: "10" }))).not.toBeNull();
    expect(validateStep("budget", form({ budget: "20" }))).toBeNull();
  });

  it("rejects a budget above the platform maximum", () => {
    expect(validateStep("budget", form({ budget: "9999999" }))).not.toBeNull();
  });

  it("treats a same-day task as needing no date", () => {
    expect(validateStep("schedule", form({ sameDay: true }))).toBeNull();
  });

  it("allows a blank date, meaning flexible", () => {
    expect(validateStep("schedule", form({ sameDay: false, scheduledFor: "" }))).toBeNull();
  });

  it("rejects a date it cannot parse", () => {
    expect(
      validateStep("schedule", form({ sameDay: false, scheduledFor: "next tuesday-ish" })),
    ).not.toBeNull();
  });

  it("requires both a public landmark and a private address", () => {
    expect(validateStep("location", form({ landmark: "", exactAddress: "12 Road" }))).not.toBeNull();
    expect(validateStep("location", form({ landmark: "Near mall", exactAddress: "" }))).not.toBeNull();
    expect(validateStep("location", COMPLETE)).toBeNull();
  });

  it("adds no rules of its own on review", () => {
    expect(validateStep("review", form())).toBeNull();
  });
});

describe("canContinue", () => {
  it("blocks an unsatisfied step and allows a satisfied one", () => {
    expect(canContinue("title", form())).toBe(false);
    expect(canContinue("title", COMPLETE)).toBe(true);
  });
});

describe("stepProgress", () => {
  it("reports a 1-based position and a fraction that ends at 1", () => {
    const steps = stepsFor(true);
    expect(stepProgress(steps, steps[0]!)).toMatchObject({ position: 1, total: steps.length });
    expect(stepProgress(steps, "review").fraction).toBe(1);
  });
});

describe("firstIncompleteStep", () => {
  it("finds the earliest step still needing attention", () => {
    const steps = stepsFor(true);
    expect(firstIncompleteStep(steps, form())).toBe("title");
  });

  it("returns null once every step passes", () => {
    expect(firstIncompleteStep(stepsFor(true), COMPLETE)).toBeNull();
  });

  it("catches a field edited back into an invalid state after review", () => {
    // The guard that stops the wizard submitting something the server rejects.
    const broken = { ...COMPLETE, budget: "1" };
    expect(firstIncompleteStep(stepsFor(true), broken)).toBe("budget");
  });
});
