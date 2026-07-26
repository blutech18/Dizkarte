import { describe, expect, it } from "vitest";
import {
  createReportSchema,
  createTaskSchema,
  phMobileSchema,
  registerSchema,
  submitOfferSchema,
  taskSearchSchema,
} from "../index.js";

const validPublicLocation = {
  cityCode: "133900",
  barangayCode: "133901001",
  landmark: "Near the plaza",
  approximateLat: 14.599,
  approximateLng: 120.984,
};

const validPrivateLocation = {
  exactAddress: "123 Real St, Barangay 1",
  exactLat: 14.599512,
  exactLng: 120.984223,
};

describe("registerSchema", () => {
  it("normalizes email and enforces password length", () => {
    const parsed = registerSchema.parse({
      email: "  USER@Example.com ",
      password: "correcthorse",
      displayName: "Juan",
    });
    expect(parsed.email).toBe("user@example.com");
  });

  it("rejects short passwords", () => {
    expect(
      registerSchema.safeParse({ email: "a@b.co", password: "short", displayName: "Ok" }).success,
    ).toBe(false);
  });
});

describe("phMobileSchema", () => {
  it("normalizes local and +63 forms to E.164", () => {
    expect(phMobileSchema.parse("09171234567")).toBe("+639171234567");
    expect(phMobileSchema.parse("+639171234567")).toBe("+639171234567");
  });
  it("rejects invalid numbers", () => {
    expect(phMobileSchema.safeParse("12345").success).toBe(false);
  });
});

describe("createTaskSchema", () => {
  it("accepts a well-formed task and rounds approximate coordinates", () => {
    const parsed = createTaskSchema.parse({
      categoryId: "00000000-0000-4000-8000-000000000001",
      title: "Fix a leaking faucet",
      description: "The kitchen faucet has been leaking for two days and needs repair.",
      budgetCentavos: 50000,
      sameDay: true,
      publicLocation: { ...validPublicLocation, approximateLat: 14.5991234 },
      privateLocation: validPrivateLocation,
      media: [],
    });
    expect(parsed.publicLocation.approximateLat).toBe(14.599);
    expect(parsed.privateLocation.exactLat).toBe(14.599512);
  });

  it("rejects budgets below the minimum safeguard", () => {
    const result = createTaskSchema.safeParse({
      categoryId: "00000000-0000-4000-8000-000000000001",
      title: "Tiny task",
      description: "This description is definitely long enough to pass validation.",
      budgetCentavos: 100,
      publicLocation: validPublicLocation,
      privateLocation: validPrivateLocation,
    });
    expect(result.success).toBe(false);
  });

  it("rejects floating-point budgets", () => {
    const result = createTaskSchema.safeParse({
      categoryId: "00000000-0000-4000-8000-000000000001",
      title: "Valid title here",
      description: "This description is definitely long enough to pass validation.",
      budgetCentavos: 500.5,
      publicLocation: validPublicLocation,
      privateLocation: validPrivateLocation,
    });
    expect(result.success).toBe(false);
  });
});

describe("submitOfferSchema", () => {
  it("requires an integer-centavo amount and message", () => {
    const parsed = submitOfferSchema.parse({
      taskId: "00000000-0000-4000-8000-000000000002",
      amountCentavos: 45000,
      message: "I can do this today.",
      etaText: "Within 2 hours",
      availabilityText: "Today 2-6pm",
      experienceText: "5 years plumbing experience",
    });
    expect(parsed.amountCentavos).toBe(45000);
  });

  it("rejects a non-uuid task id", () => {
    expect(
      submitOfferSchema.safeParse({
        taskId: "not-a-uuid",
        amountCentavos: 45000,
        message: "x",
        etaText: "x",
        availabilityText: "x",
        experienceText: "x",
      }).success,
    ).toBe(false);
  });
});

describe("taskSearchSchema", () => {
  it("applies bounded pagination defaults", () => {
    const parsed = taskSearchSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.sort).toBe("newest");
  });

  it("caps page size at the maximum", () => {
    expect(taskSearchSchema.safeParse({ pageSize: 1000 }).success).toBe(false);
  });
});

describe("createReportSchema", () => {
  it("validates resource type and narrative length", () => {
    expect(
      createReportSchema.safeParse({
        resourceType: "task",
        resourceId: "00000000-0000-4000-8000-000000000003",
        category: "spam",
        narrative: "short",
      }).success,
    ).toBe(false);
  });
});
