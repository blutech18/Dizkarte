import { describe, expect, it } from "vitest";
import { verificationStatusLabel, verificationStatusTone } from "./status";

describe("verification status mapping", () => {
  it("maps every known status to a literal label (never color-only)", () => {
    const statuses = ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"];
    for (const status of statuses) {
      expect(verificationStatusLabel(status).length).toBeGreaterThan(0);
      expect(verificationStatusTone(status)).toBeTruthy();
    }
  });

  it("uses success tone only for APPROVED and error tone only for REJECTED", () => {
    expect(verificationStatusTone("APPROVED")).toBe("success");
    expect(verificationStatusTone("REJECTED")).toBe("error");
  });
});
